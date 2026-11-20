"""Cut the painting card sheets in art/source/paintings/ into one image per work.

Each sheet is a 5x2 grid of cards on a dark background, with a cream frame
around every card. We crop inside the frame, so the game can draw its own.

    python3 tools/slice_art.py

Writes src/assets/art/<sheet>-<n>.jpg (n = 1..10, left to right, top to bottom).

TILE_SHEETS are a different layout: 5x2 unframed canvases edge to edge,
split by thin white gutters. We find the gutters and keep each canvas whole,
landscape and all (the game sizes the frame to the picture).
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
    print('wrote', len(list(OUT.glob('*.jpg'))), 'paintings to', OUT)


if __name__ == '__main__':
    main()
