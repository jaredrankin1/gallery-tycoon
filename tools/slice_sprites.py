"""Slice character sprite sheets into transparent animation atlases.

Usage: python3 tools/slice_sprites.py   (reads art/source/*.png, writes src/assets/sprites/)

Each source sheet has the same layout (1536x1024): a portrait top-left and
three rows of labelled animation groups. Backgrounds are smooth painted
gradients, so we remove them with an edge-aware flood fill from the strip
borders: we only step into a neighbouring pixel when the colour changes a
little, which stops at the characters' crisp dark outlines.
"""
import json, os, sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art', 'source')
OUT = os.path.join(ROOT, 'src', 'assets', 'sprites')

# Rows: (y0, y1, x0, [(animation, frames), ...]) in sheet order, left to right.
ROWS = [
    (78, 318, 295, [('idle', 4), ('walk', 8)]),
    (418, 668, 0, [('look', 6), ('think', 4), ('impressed', 4)]),
    (742, 1004, 0, [('disapprove', 4), ('photo', 4), ('notes', 4), ('chat', 4)]),
]
# Victor's sheet swaps two labels: row 2 group 3 is "disappointed", row 3 group 1 is "approve".
SWAPS = {'victor': {'impressed': 'disapprove', 'disapprove': 'impressed'}}

STEP = 14       # max colour step (sum of |dR|+|dG|+|dB|) to keep flooding background
SCALE = 0.5     # output scale
# (left, top, side) of a square inside each portrait frame
PORTRAIT_BOX = {'rosa': (24, 40, 240)}
# Frames the background removal damaged (low contrast against the backdrop): use another frame instead.
FRAME_OVERRIDES = {'victor': {('walk', 3): ('walk', 7)}}


def flood_background(rgb):
    """Boolean mask of background reachable from the border through small colour steps."""
    h, w, _ = rgb.shape
    bg = np.zeros((h, w), bool)
    bg[0, :] = bg[-1, :] = True
    bg[:, 0] = bg[:, -1] = True
    # pairwise differences to the 4 neighbours
    dx = np.abs(np.diff(rgb, axis=1)).sum(2) < STEP  # between (y,x) and (y,x+1)
    dy = np.abs(np.diff(rgb, axis=0)).sum(2) < STEP  # between (y,x) and (y+1,x)
    while True:
        prev = bg.sum()
        grow = bg.copy()
        grow[:, 1:] |= bg[:, :-1] & dx      # from left
        grow[:, :-1] |= bg[:, 1:] & dx      # from right
        grow[1:, :] |= bg[:-1, :] & dy      # from above
        grow[:-1, :] |= bg[1:, :] & dy      # from below
        bg = grow
        # run a few cheap passes per check
        for _ in range(20):
            g2 = bg.copy()
            g2[:, 1:] |= bg[:, :-1] & dx
            g2[:, :-1] |= bg[:, 1:] & dx
            g2[1:, :] |= bg[:-1, :] & dy
            g2[:-1, :] |= bg[1:, :] & dy
            bg = g2
        if bg.sum() == prev:
            return bg


def label(fg):
    """4-connected component labels (no scipy). Returns (labels, sizes)."""
    h, w = fg.shape
    lab = np.zeros((h, w), np.int32)
    sizes = [0]
    ys, xs = np.nonzero(fg)
    cur = 0
    for y0, x0 in zip(ys, xs):
        if lab[y0, x0]:
            continue
        cur += 1
        stack = [(y0, x0)]
        lab[y0, x0] = cur
        n = 0
        while stack:
            y, x = stack.pop()
            n += 1
            for yy, xx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= yy < h and 0 <= xx < w and fg[yy, xx] and not lab[yy, xx]:
                    lab[yy, xx] = cur
                    stack.append((yy, xx))
        sizes.append(n)
    return lab, np.array(sizes)


def frame_masks(fg, want):
    """One mask per character frame: big components are bodies, small bits join the nearest body."""
    lab, sizes = label(fg)
    big = [i for i in range(1, len(sizes)) if sizes[i] >= 1500]
    centers = {i: np.nonzero(lab == i)[1].mean() for i in big}
    big.sort(key=lambda i: centers[i])
    masks = [lab == i for i in big]
    # merge bodies that are too close (split limbs) until we have `want`
    while len(masks) > want:
        cx = [np.nonzero(m)[1].mean() for m in masks]
        gaps = [cx[i + 1] - cx[i] for i in range(len(cx) - 1)]
        i = int(np.argmin(gaps))
        masks[i:i + 2] = [masks[i] | masks[i + 1]]
    while len(masks) < want:
        # two frames touching (e.g. overlapping hats): cut the widest blob at its thinnest column
        widths = [np.ptp(np.nonzero(m)[1]) for m in masks]
        i = int(np.argmax(widths))
        m = masks[i]
        xs = np.nonzero(m.any(0))[0]
        lo, hi = xs[0] + int(len(xs) * 0.3), xs[0] + int(len(xs) * 0.7)
        cut = lo + int(np.argmin(m[:, lo:hi].sum(0)))
        left, right = m.copy(), m.copy()
        left[:, cut:] = False
        right[:, :cut] = False
        masks[i:i + 1] = [left, right]
    cx = [np.nonzero(m)[1].mean() for m in masks]
    h, w = fg.shape
    for i in range(1, len(sizes)):
        if i in big or sizes[i] < 6:
            continue
        pts = np.nonzero(lab == i)
        if pts[1].min() == 0 or pts[1].max() == w - 1:
            continue  # bits of the portrait frame or a neighbouring group, cut by the strip edge
        x = pts[1].mean()
        j = int(np.argmin([abs(x - c) for c in cx]))
        if abs(x - cx[j]) < 70:
            masks[j][pts] = True
    return masks


def components_x(fg, min_px=400):
    """Split a strip into frames by empty columns; returns [(x0, x1)]."""
    cols = fg.sum(0)
    spans, inside, start = [], False, 0
    for x, c in enumerate(cols):
        if c > 2 and not inside:
            inside, start = True, x
        elif c <= 2 and inside:
            inside = False
            spans.append((start, x))
    if inside:
        spans.append((start, len(cols)))
    return [s for s in spans if fg[:, s[0]:s[1]].sum() >= min_px]


def fix_count(spans, want):
    """Merge tiny fragments / split merged blobs until we have `want` spans."""
    spans = list(spans)
    while len(spans) > want:  # merge the narrowest gap pair
        gaps = [spans[i + 1][0] - spans[i][1] for i in range(len(spans) - 1)]
        i = int(np.argmin(gaps))
        spans[i:i + 2] = [(spans[i][0], spans[i + 1][1])]
    while len(spans) < want:  # split the widest span in half
        i = int(np.argmax([b - a for a, b in spans]))
        a, b = spans[i]
        m = (a + b) // 2
        spans[i:i + 1] = [(a, m), (m, b)]
    return spans


def slice_sheet(name):
    img = Image.open(os.path.join(SRC, f'{name}.png')).convert('RGB')
    rgb = np.asarray(img).astype(np.int16)
    frames = {}
    for (y0, y1, x0, groups) in ROWS:
        strip = rgb[y0:y1, x0:]
        fg = ~flood_background(strip)
        # drop specks
        want = sum(n for _, n in groups)
        masks = frame_masks(fg, want)
        i = 0
        for anim, n in groups:
            anim = SWAPS.get(name, {}).get(anim, anim)
            frames[anim] = []
            for _ in range(n):
                m = masks[i]
                i += 1
                ys = np.where(m.any(1))[0]
                xs = np.where(m.any(0))[0]
                a, b = xs[0], xs[-1] + 1
                sub = m[:, a:b]
                crop_rgb = strip[ys[0]:ys[-1] + 1, a:b]
                crop_a = (sub[ys[0]:ys[-1] + 1] * 255).astype(np.uint8)
                rgba = np.dstack([crop_rgb.astype(np.uint8), crop_a])
                frames[anim].append(Image.fromarray(rgba, 'RGBA'))
    return frames


def portrait(name):
    """The framed head-and-shoulders portrait in the top-left corner, as a 96px square."""
    img = Image.open(os.path.join(SRC, f'{name}.png')).convert('RGB')
    l, t, side = PORTRAIT_BOX.get(name, (32, 52, 228))
    return img.crop((l, t, l + side, t + side)).resize((96, 96), Image.LANCZOS)


def build(name):
    frames = slice_sheet(name)
    for (anim, i), (src_anim, j) in FRAME_OVERRIDES.get(name, {}).items():
        frames[anim][i] = frames[src_anim][j]
    # Uniform cell, feet on the bottom edge, centred on each frame's body column.
    all_f = [f for fs in frames.values() for f in fs]
    cw = max(f.width for f in all_f)
    ch = max(f.height for f in all_f)
    order = ['idle', 'walk', 'look', 'think', 'impressed', 'disapprove', 'photo', 'notes', 'chat']
    cols = max(len(frames[k]) for k in order)
    sheet = Image.new('RGBA', (cw * cols, ch * len(order)), (0, 0, 0, 0))
    for r, anim in enumerate(order):
        for c, f in enumerate(frames[anim]):
            a = np.asarray(f)[:, :, 3] > 0
            # anchor on the median x of the bottom third (the legs), so arms/props don't shift the body
            lower = a[int(f.height * 0.66):]
            xs = np.where(lower.any(0))[0]
            cx = int((xs[0] + xs[-1]) / 2) if len(xs) else f.width // 2
            sheet.paste(f, (c * cw + cw // 2 - cx, r * ch + ch - f.height), f)
    out_w, out_h = int(cw * SCALE), int(ch * SCALE)
    sheet = sheet.resize((out_w * cols, out_h * len(order)), Image.LANCZOS)
    # harden alpha so pixel edges stay crisp
    arr = np.asarray(sheet).copy()
    arr[:, :, 3] = np.where(arr[:, :, 3] > 110, 255, 0)
    # pixel art: a 128-colour palette keeps the files small without visible loss
    Image.fromarray(arr, 'RGBA').quantize(128, method=Image.Quantize.FASTOCTREE).save(os.path.join(OUT, f'{name}.png'), optimize=True)
    portrait(name).quantize(128).save(os.path.join(OUT, f'{name}-portrait.png'), optimize=True)
    return {'cell': [out_w, out_h], 'anims': {k: [r, len(frames[k])] for r, k in enumerate(order)}}


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    names = sys.argv[1:] or sorted(f[:-4] for f in os.listdir(SRC) if f.endswith('.png'))
    meta = {}
    for n in names:
        meta[n] = build(n)
        print(n, meta[n]['cell'])
    with open(os.path.join(OUT, 'sprites.json'), 'w') as fh:
        json.dump(meta, fh, indent=1)
