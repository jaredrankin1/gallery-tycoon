"""Slice Jared's patron sheets (art/source/patrons/) into one still sprite each.

    python3 tools/slice_patrons.py

Each sheet is two rows of ten or eleven figures, one still pose apiece: these are drawn
as flat paper cutouts that hop (src/render/cutout.ts), so a patron needs no
animation. Sheets 1 and 4 are on white (flood-filled away, as in
slice_sprites.py); sheet 2 already has transparency; sheet 3 is on black,
which needs care because the outlines are black too (black_foreground). One cell of sheet 1 is
a sculpture on a pedestal, not a person, and is skipped.

Sizes: every figure on a sheet keeps its size relative to the others (a child
stays small, a wheelchair stays low), and the sheet is scaled so its typical
adult draws as tall on screen as the existing visitors.

Writes src/assets/sprites/patron-NN.png and adds each to sprites.json.
"""
import json
import os

import numpy as np
from PIL import Image

from slice_sprites import OUT, ROOT, flood_background, label

SRC = os.path.join(ROOT, 'art', 'source', 'patrons')
SHEETS = ['sheet1.png', 'sheet2.png', 'sheet3.png', 'sheet4.png']
# (sheet, row, column) cells that aren't patrons.
SKIP = {(0, 1, 8)}  # the twisted white sculpture
# A typical adult's on-screen height, matching the existing visitors (61-64px).
ADULT_PX = 62
# Atlas pixels per screen pixel, like the other character atlases.
DENSITY = 2


def shift_all(m, r, op):
    """Binary erode (op=np.logical_and) or dilate (op=np.logical_or) by a (2r+1) square."""
    out = m.copy()
    h, w = m.shape
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            s = np.zeros_like(m) if op is np.logical_or else np.ones_like(m)
            s[max(0, dy):h + min(0, dy), max(0, dx):w + min(0, dx)] = m[max(0, -dy):h + min(0, -dy), max(0, -dx):w + min(0, -dx)]
            out = op(out, s)
    return out


def flood_within(mask):
    """The part of `mask` connected to the image border."""
    reach = np.zeros_like(mask)
    reach[0, :], reach[-1, :], reach[:, 0], reach[:, -1] = mask[0, :], mask[-1, :], mask[:, 0], mask[:, -1]
    while True:
        prev = reach.sum()
        for _ in range(20):
            g = reach.copy()
            g[1:, :] |= reach[:-1, :]
            g[:-1, :] |= reach[1:, :]
            g[:, 1:] |= reach[:, :-1]
            g[:, :-1] |= reach[:, 1:]
            reach = g & mask
        if reach.sum() == prev:
            return reach


# Black backgrounds: the figures' own outlines are the same black, so a plain
# flood would eat every line that touches the edge. Instead, open the near-black
# area (erode then dilate) so thin lines drop out of it, keep only what still
# reaches the border, then grow the figure back by the outline's width.
BLACK = 20      # max channel value counted as background black
OPEN_R = 4      # lines thinner than 2 * OPEN_R stay with the figure
OUTLINE_R = 3   # outer outline width given back to each figure


def black_foreground(rgb):
    dark = rgb.max(2) <= BLACK
    opened = shift_all(shift_all(dark, OPEN_R, np.logical_and), OPEN_R, np.logical_or) & dark
    bg = flood_within(opened)
    fg = shift_all(~bg, OUTLINE_R, np.logical_or)
    return fg


def foreground(path):
    im = Image.open(path).convert('RGBA')
    a = np.array(im)
    rgb = a[..., :3].astype(np.int32)
    if (a[..., 3] < 255).any():
        fg = a[..., 3] > 40
    elif rgb[:4, :4].max() <= BLACK:
        fg = black_foreground(rgb)
    else:
        fg = ~flood_background(rgb)
    a[..., 3] = np.where(fg, a[..., 3], 0)
    return a, fg


def spans(mask_1d, min_gap, min_len):
    """Runs of True in a 1-D mask, merging runs separated by gaps under min_gap."""
    idx = np.nonzero(mask_1d)[0]
    if not len(idx):
        return []
    runs = [[idx[0], idx[0]]]
    for i in idx[1:]:
        if i - runs[-1][1] <= min_gap:
            runs[-1][1] = i
        else:
            runs.append([i, i])
    return [(s, e + 1) for s, e in runs if e - s >= min_len]


def figures(a, fg):
    """Each figure as its own connected shape (with any loose bits inside its box), by row then x."""
    h = fg.shape[0]
    # The rows almost touch (hats), so split at the emptiest line near the middle.
    prof = fg.sum(1)
    mid = h // 2 - 60 + int(np.argmin(prof[h // 2 - 60:h // 2 + 60]))
    out = []
    for r, (y0, y1) in enumerate([(0, mid), (mid, h)]):
        lab, sizes = label(fg[y0:y1])
        boxes = []
        for i, n in enumerate(sizes):
            if i == 0 or n < 50:
                continue
            ys, xs = np.nonzero(lab == i)
            boxes.append([n, xs.min(), xs.max() + 1, ys.min(), ys.max() + 1, [i]])
        big = sorted([b for b in boxes if b[0] >= 3000], key=lambda b: b[1])
        for b in boxes:
            if b[0] >= 3000:
                continue
            cx, cy = (b[1] + b[2]) / 2, (b[3] + b[4]) / 2
            home = [g for g in big if g[1] <= cx < g[2] and g[3] <= cy < g[4]]
            ys, xs = np.nonzero(lab == b[5][0])
            if a[y0 + ys, xs, :3].mean() > 225:
                continue  # a scrap of the white background, not part of anyone
            if home:  # a loose bit (a hand, a cane, a strap) inside a figure's box
                g = home[0]
                g[1], g[2], g[3], g[4] = min(g[1], b[1]), max(g[2], b[2]), min(g[3], b[3]), max(g[4], b[4])
                g[5].append(b[5][0])
        assert len(big) in (10, 11), (r, len(big))
        for c, (n, x0, x1, ya, yb, ids) in enumerate(big):
            keep = np.isin(lab[ya:yb, x0:x1], ids)
            img = a[y0 + ya:y0 + yb, x0:x1].copy()
            img[..., 3] = np.where(keep, img[..., 3], 0)
            out.append((r, c, img))
    return out


def main():
    meta_path = os.path.join(OUT, 'sprites.json')
    meta = json.load(open(meta_path))
    for k in [k for k in meta if k.startswith('patron-')]:
        del meta[k]
    n = 0
    for s, sheet in enumerate(SHEETS):
        a, fg = foreground(os.path.join(SRC, sheet))
        figs = [(r, c, img) for r, c, img in figures(a, fg) if (s, r, c) not in SKIP]
        # The typical adult: the median figure height on the sheet.
        k = ADULT_PX * DENSITY / float(np.median([img.shape[0] for _, _, img in figs]))
        for r, c, img in figs:
            n += 1
            name = f'patron-{n:02d}'
            im = Image.fromarray(img)
            w, hh = max(1, round(im.width * k)), max(1, round(im.height * k))
            im = im.resize((w, hh), Image.LANCZOS)
            im.save(os.path.join(OUT, f'{name}.png'), optimize=True)
            meta[name] = {
                'cell': [w, hh],
                # The figure fills its cell, so set the height that draws at the standard 68px.
                'ref': round(68 * DENSITY),
                'anims': {'idle': [0, 1]},
            }
    json.dump(meta, open(meta_path, 'w'), indent=1)
    print(f'wrote {n} patrons')


if __name__ == '__main__':
    main()
