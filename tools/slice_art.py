"""Cut the painting card sheets in art/source/paintings/ into one image per work.

Each sheet is a 5x2 grid of cards on a dark background, with a cream frame
around every card. We crop inside the frame, so the game can draw its own.

    python3 tools/slice_art.py

Writes src/assets/art/<sheet>-<n>.jpg (n = 1..10, left to right, top to bottom).

TILE_SHEETS are a different layout: 5x2 unframed canvases edge to edge,
split by thin white gutters. We find the gutters and keep each canvas whole,
landscape and all (the game sizes the frame to the picture).

GRID_SHEETS are evenly spaced grids whose cells may carry a baked-in frame
(gold mouldings, pixel-art borders) or sit on a coloured gutter. Each cell is
trimmed from every side, line by line, while the line is still mostly frame
or gutter, and then a little more, so only the picture is left. The game draws
its own frame.
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art' / 'source' / 'paintings'
OUT = ROOT / 'src' / 'assets' / 'art'

# Card boxes on a 1536x1024 sheet (left, top), all the same size.
COLS = [10, 320, 622, 921, 1227]
ROWS = [11, 514]
CARD = (298, 494)
INSET = 17  # cream frame
SIZE = (180, 312)  # output, close to the art's own aspect

TILE_SHEETS = ['neo', 'photoreal']
TILE_W = 300  # output width; height keeps the canvas's aspect
GUTTER = 235  # a row/column this bright on average is a gutter
TILE_INSET = 3


def spans(profile):
    """(start, end) of every run of non-gutter lines longer than 100 px."""
    out, start = [], None
    for i, v in enumerate(list(profile) + [255]):
        if v <= GUTTER and start is None:
            start = i
        elif v > GUTTER and start is not None:
            if i - start > 100:
                out.append((start, i))
            start = None
    return out


def slice_tiles(name):
    im = Image.open(SRC / f'{name}.png').convert('RGB')
    grey = np.asarray(im.convert('L'), dtype=float)
    cols, rows = spans(grey.mean(0)), spans(grey.mean(1))
    assert len(cols) == 5 and len(rows) == 2, (name, cols, rows)
    n = 0
    for top, bottom in rows:
        for left, right in cols:
            n += 1
            box = (left + TILE_INSET, top + TILE_INSET, right - TILE_INSET, bottom - TILE_INSET)
            w, h = box[2] - box[0], box[3] - box[1]
            art = im.crop(box).resize((TILE_W, round(TILE_W * h / w)), Image.LANCZOS)
            art.save(OUT / f'{name}-{n}.jpg', quality=84, optimize=True)


# name: (columns, rows, ground, frame width in source px, output width)
# Each cell is first trimmed of its ground ('dark', 'black' or 'light' gutter lines),
# then the baked-in frame, the same width on every side, is cut off.
GRID_SHEETS = {
    'lowpoly': (5, 2, 'black', 2, 300),
    'stilllife': (5, 2, 'dark', 13, 300),
    'medieval': (5, 2, 'dark', 38, 300),
    'romantic': (5, 2, 'dark', 20, 300),
    'bwphoto': (5, 2, 'black', 2, 300),
    'western': (5, 2, 'light', 2, 300),
    'pixelland': (5, 2, 'dark', 16, 300),
    'impasto': (2, 5, 'light', 8, 600),
}


def ground_mask(px, kind):
    """True where a pixel is gutter rather than frame or picture."""
    total = px.sum(2)
    if kind == 'light':
        return (total > 690) & (np.abs(px[..., 0] - px[..., 2]) < 30)
    if kind == 'black':  # pure black gutters around pictures that can be dark themselves
        return total < 12
    return total < 100


def trim_cell(px, kind, inset):
    """(left, top, right, bottom) of the picture inside one cell."""
    mask = ground_mask(px, kind)
    h, w = mask.shape

    def edge(lines, n):
        # Past the last gutter line, stepping over a stray seam or two.
        last = -1
        for i in range(n // 3):
            if lines(i).mean() > 0.5:
                last = i
            elif i - last > 4:
                break
        return last + 1 + inset

    left = edge(lambda i: mask[:, i], w)
    right = w - edge(lambda i: mask[:, w - 1 - i], w)
    top = edge(lambda i: mask[i, :], h)
    bottom = h - edge(lambda i: mask[h - 1 - i, :], h)
    return left, top, right, bottom


def bands(gutter, count, size):
    """Picture spans along one axis, split at gutter lines; even split if they don't add up."""
    out, start = [], None
    for i, g in enumerate(list(gutter) + [True]):
        if not g and start is None:
            start = i
        elif g and start is not None:
            if i - start > 60:
                out.append((start, i))
            start = None
    if len(out) != count:
        step = size / count
        out = [(round(k * step), round((k + 1) * step)) for k in range(count)]
    return out


def slice_grid(name, cols, rows, kind, inset, out_w):
    im = Image.open(SRC / f'{name}.png').convert('RGB')
    px = np.asarray(im, dtype=int)
    ground = ground_mask(px, kind)
    n = 0
    # Columns across the whole sheet, then rows inside each column: some sheets
    # are packed unevenly, and their rows don't line up from column to column.
    # Dark grounds aren't searched: dark pictures would read as gutter.
    find = kind == 'light'
    col_spans = bands(ground.mean(0) > 0.9 if find else [], cols, im.width)
    cells = {}
    for c, (x0, x1) in enumerate(col_spans):
        for r, (y0, y1) in enumerate(bands(ground[:, x0:x1].mean(1) > 0.9 if find else [], rows, im.height)):
            cells[r, c] = (x0, y0, x1, y1)
    for row in range(rows):
        for col in range(cols):
            n += 1
            x0, y0, x1, y1 = cells[row, col]
            if find:  # pad back out a little so the trim sees the gutter edge
                x0, y0 = max(0, x0 - 4), max(0, y0 - 4)
                x1, y1 = min(im.width, x1 + 4), min(im.height, y1 + 4)
            l, t, r, b = trim_cell(px[y0:y1, x0:x1], kind, inset)
            art = im.crop((x0 + l, y0 + t, x0 + r, y0 + b))
            art = art.resize((out_w, round(out_w * art.height / art.width)), Image.LANCZOS)
            art.save(OUT / f'{name}-{n}.jpg', quality=84, optimize=True)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for sheet in sorted(SRC.glob('sheet*.png')):
        im = Image.open(sheet).convert('RGB')
        sx, sy = im.width / 1536, im.height / 1024
        n = 0
        for top in ROWS:
            for left in COLS:
                n += 1
                box = (
                    round((left + INSET) * sx),
                    round((top + INSET) * sy),
                    round((left + CARD[0] - INSET) * sx),
                    round((top + CARD[1] - INSET) * sy),
                )
                art = im.crop(box).resize(SIZE, Image.LANCZOS)
                art.save(OUT / f'{sheet.stem}-{n}.jpg', quality=84, optimize=True)
    for name in TILE_SHEETS:
        slice_tiles(name)
    for name, spec in GRID_SHEETS.items():
        slice_grid(name, *spec)
    print('wrote', len(list(OUT.glob('*.jpg'))), 'paintings to', OUT)


if __name__ == '__main__':
    main()
