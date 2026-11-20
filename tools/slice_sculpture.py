"""Cut the sculpture sheets in art/source/sculptures/ into one sprite per piece.

Every sheet is a 5x2 grid of pieces (2172x724). Four sheets (geometric,
organic, salvage, pop) come with each piece already standing on a plinth with a brass plaque, on a transparent
background. The rest need extra work:

  brutalist.png  no alpha at all: the pieces sit on a light checkerboard,
                 which we flood-fill away from the edges (and from any large
                 enclosed holes, like the ring in piece 5).
  ceramic.png    transparent, but no plinths.
  textile.png    fibre art, no plinths. Six are wall hangings (WALL) and are
                 kept flat; the other four get a plinth.
  vinyl.png, toys.png, marble.png
                 designer toys (glossy and matte) and classical busts,
                 transparent, no plinths.
  western.png    bronzes on a plain white background, no alpha: removed the
                 same way as the checkerboard. Their cast rock bases are kept
                 and stood on the plinth.

So that every sculpture stands the same way in the game, pieces without a
plinth get one: the plinth from organic.png piece 2 is cut out once and the
piece is scaled to sit on it.

Some sheets also carry red/yellow colour in fully transparent pixels and a
faint low-alpha fringe. We drop anything under ALPHA_MIN and clear the colour
of every transparent pixel so nothing bleeds in when the sprite is scaled.

    python3 tools/slice_sculpture.py

Writes src/assets/sculpture/<sheet>-<n>.png (n = 1..10, left to right, top
to bottom). Every sprite's bottom edge is the front of its plinth, which is
where the renderer stands it on the floor.
"""
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from slice_sprites import label  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art' / 'source' / 'sculptures'
OUT = ROOT / 'src' / 'assets' / 'sculpture'

SHEETS = ['geometric', 'organic', 'salvage', 'pop', 'brutalist', 'ceramic', 'textile', 'vinyl', 'toys', 'marble', 'western']
NO_PLINTH = {'brutalist', 'ceramic', 'textile', 'vinyl', 'toys', 'marble', 'western'}
# Textile pieces that hang on a wall instead: no plinth, drawn flat on the wall.
WALL = {('textile', n) for n in (1, 3, 4, 7, 9, 10)}
# Enclosed background patches at least this big are holes, not paint. Bronze
# has no white anywhere, so even the gaps between wheel spokes can go.
HOLE_MIN = {'western': 12}
COLS, ROWS = 5, 2
ALPHA_MIN = 48     # below this a pixel is fringe, not sculpture
MIN_PART = 150     # smaller blobs are specks
SCALE = 0.4        # sheet pixels -> sprite pixels (sprites are drawn at ~1/3 size)
PLINTH_FROM = ('organic', 2)
PLINTH_H = 68      # bottom rows of that piece that are plinth, in sheet pixels
PLINTH_LID = 18    # top rows of it: the plinth's top face, where the piece stood


def checker_alpha(rgb, hole_min=400):
    """Alpha for a sheet drawn on a light grey checkerboard."""
    lo, hi = rgb.min(2), rgb.max(2)
    bgish = (lo >= 228) & (hi - lo <= 14)
    lab, sizes = label(bgish)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    big = {i for i in range(1, len(sizes)) if sizes[i] >= hole_min}
    bg = np.isin(lab, list(edge | big))
    # Pull the cut in one pixel so no pale anti-aliasing is left on the outline.
    grown = bg.copy()
    grown[1:] |= bg[:-1]
    grown[:-1] |= bg[1:]
    grown[:, 1:] |= bg[:, :-1]
    grown[:, :-1] |= bg[:, 1:]
    return np.where(grown, 0, 255).astype(np.uint8)


def load(name):
    im = Image.open(SRC / f'{name}.png')
    if im.mode == 'RGBA':
        a = np.array(im)
    else:
        rgb = np.array(im.convert('RGB'))
        a = np.dstack([rgb, checker_alpha(rgb.astype(int), HOLE_MIN.get(name, 400))])
    a[a[..., 3] < ALPHA_MIN] = 0
    return a


def pieces(a):
    """The 10 pieces of a sheet as tight RGBA crops, in reading order."""
    h, w = a.shape[:2]
    lab, sizes = label(a[..., 3] > 0)
    cells = [np.zeros((h, w), bool) for _ in range(COLS * ROWS)]
    for i in range(1, len(sizes)):
        if sizes[i] < MIN_PART:
            continue
        ys, xs = np.nonzero(lab == i)
        col = min(COLS - 1, int(xs.mean() / (w / COLS)))
        row = min(ROWS - 1, int(ys.mean() / (h / ROWS)))
        cells[row * COLS + col][ys, xs] = True
    out = []
    for m in cells:
        ys, xs = np.nonzero(m)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        crop = a[y0:y1, x0:x1].copy()
        crop[~m[y0:y1, x0:x1]] = 0
        out.append(Image.fromarray(crop, 'RGBA'))
    return out


def shrink(im, s):
    """Scale with premultiplied alpha so transparent pixels can't tint the edges."""
    size = (max(1, round(im.width * s)), max(1, round(im.height * s)))
    return im.convert('RGBa').resize(size, Image.LANCZOS).convert('RGBA')


def on_plinth(piece, plinth):
    """Stand a plinth-less piece on the shared plinth (both in sheet pixels)."""
    top_w = plinth.width * 0.86
    s = min(1.0, top_w / piece.width, 300 / piece.height)
    p = shrink(piece, s) if s < 1 else piece
    sink = 4  # tuck the base into the plinth's top edge
    w = max(plinth.width, p.width)
    h = p.height + plinth.height - sink
    canvas = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    canvas.alpha_composite(plinth, ((w - plinth.width) // 2, h - plinth.height))
    canvas.alpha_composite(p, ((w - p.width) // 2, 0))
    return canvas


def clean_lid(plinth):
    """Paint out the feet of the piece that stood on the borrowed plinth.

    The top face is plain grey, so any coloured pixel there is the old piece:
    replace it with that row's typical grey.
    """
    a = np.array(plinth)
    for y in range(PLINTH_LID):
        row = a[y]
        rgb = row[:, :3].astype(int)
        on = row[:, 3] > 0
        grey = on & (rgb.max(1) - rgb.min(1) <= 24)
        if not grey.any():
            continue
        fill = np.median(row[grey], axis=0).astype(np.uint8)
        bad = on & ~grey
        row[bad, :3] = fill[:3]
        row[bad, 3] = np.maximum(row[bad, 3], fill[3])
    return Image.fromarray(a, 'RGBA')


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    sheets = {name: pieces(load(name)) for name in SHEETS}
    src = sheets[PLINTH_FROM[0]][PLINTH_FROM[1] - 1]
    plinth = src.crop((0, src.height - PLINTH_H, src.width, src.height))
    # Trim to the plinth's own columns (the piece above may be wider).
    cols = np.nonzero(np.array(plinth)[..., 3].max(0) > 0)[0]
    plinth = plinth.crop((cols.min(), 0, cols.max() + 1, plinth.height))
    plinth = clean_lid(plinth)
    total = 0
    for name, items in sheets.items():
        for n, piece in enumerate(items, 1):
            if name in NO_PLINTH and (name, n) not in WALL:
                piece = on_plinth(piece, plinth)
            sprite = shrink(piece, SCALE)
            arr = np.array(sprite)
            arr[arr[..., 3] == 0] = 0
            # 256 colours per sprite: a quarter of the size, no visible change.
            out = Image.fromarray(arr, 'RGBA').quantize(256, method=Image.Quantize.FASTOCTREE)
            out.save(OUT / f'{name}-{n}.png', optimize=True)
            total += 1
    print('wrote', total, 'sculptures to', OUT)


if __name__ == '__main__':
    main()
