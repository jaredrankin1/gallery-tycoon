"""Cut the painting card sheets in art/source/paintings/ into one image per work.

Each sheet is a 5x2 grid of cards on a dark background, with a cream frame
around every card. We crop inside the frame, so the game can draw its own.

    python3 tools/slice_art.py

Writes src/assets/art/<sheet>-<n>.jpg (n = 1..10, left to right, top to bottom).
"""
from pathlib import Path

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
    print('wrote', len(list(OUT.glob('*.jpg'))), 'paintings to', OUT)


if __name__ == '__main__':
    main()
