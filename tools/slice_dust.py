"""Cut Marisol's dusting frames out of art/source/v2/assistant-dust.png.

The sheet is 2 rows of 6 cells (362 px square) on a transparent background:
she walks up to a bust on a pedestal, dusts it, and steps back pleased. In the
game she dusts whatever piece she's standing by, so the bust and pedestal are
removed and only she, the duster and the dust puffs are kept.

The bust is redrawn slightly differently in every cell, so we can't subtract
it exactly. Instead we take its silhouette from the first cell (where nothing
overlaps it), and inside that silhouette keep only pixels that look nothing
like the bust around them: the duster's dark outline and the puffs. Filling
the holes that outline encloses brings back the feathers themselves.

Used by slice_sprites_v2.py; run that script to rebuild the atlas.
Run this one on its own to write a preview strip (PREVIEW_DIR, default .).
"""
import os

import numpy as np
from PIL import Image

from slice_sprites import ROOT, label

SHEET = os.path.join(ROOT, 'art', 'source', 'v2', 'assistant-dust.png')
CELL = 362
# Sheet cells used for the animation, in play order. Cells 0-1 are her walk-in,
# which the game already does with her walk cycle.
DUST_CELLS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
BUST_X = 195  # in cell 0, everything right of this is bust and pedestal
DIFF = 70     # colour distance that counts as "not bust"


def _grow(m, r):
    out = m.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            out |= np.roll(np.roll(m, dy, 0), dx, 1)
    return out


def _fill_holes(mask, allowed):
    """Set enclosed gaps in mask, where allowed, without touching open background."""
    outside = ~mask
    lab, _ = label(outside)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])).tolist())
    holes = outside & ~np.isin(lab, list(edge))
    return mask | (holes & allowed)


def _cells():
    a = np.asarray(Image.open(SHEET).convert('RGBA')).astype(np.int16)
    return [a[r * CELL:(r + 1) * CELL, c * CELL:(c + 1) * CELL] for r in range(2) for c in range(6)]


def _cut(c, ref, near):
    fg = c[:, :, 3] > 160
    # Drop the red and yellow halo the sheet has along some edges.
    r, g, b = c[:, :, 0], c[:, :, 1], c[:, :, 2]
    halo = ((r > 150) & (g < 90) & (b < 90)) | ((r > 180) & (g > 150) & (b < 60))
    fg &= ~(halo & _grow(~fg, 2))
    keep = fg & ~near
    # Inside the bust: a pixel is the bust if the reference has a similar colour close by.
    best = np.full(fg.shape, 9999, np.int32)
    for dy in range(-2, 3):
        for dx in range(-2, 3):
            s = np.roll(np.roll(ref, dy, 0), dx, 1)
            d = np.abs(c[:, :, :3] - s[:, :, :3]).sum(2)
            best = np.minimum(best, np.where(s[:, :, 3] > 128, d, 9999))
    mask = keep | (fg & near & (best > DIFF))
    # Lone specks inside the bust are texture noise, not duster.
    lab, sizes = label(mask & near)
    for j, n in enumerate(sizes):
        if j and n < 12:
            mask[lab == j] = False
    mask = _fill_holes(mask, fg & near)
    # Keep her and the duster, and anything else big and round enough to be a dust puff.
    lab, sizes = label(mask)
    body = lab[300, :BUST_X]
    main = set(np.unique(body[body > 0]).tolist())
    for j, n in enumerate(sizes):
        if not j or j in main:
            continue
        ys, xs = np.nonzero(lab == j)
        thin = min(np.ptp(ys), np.ptp(xs)) < 8  # leftover edges of the bust and pedestal
        if n < 80 or thin:
            mask[lab == j] = False
    return Image.fromarray(np.dstack([c[:, :, :3], np.where(mask, 255, 0)]).astype(np.uint8), 'RGBA')


def frames():
    """(frames, foot x): full-cell RGBA frames, and where her feet are in the last one.

    Every frame keeps its place in the cell, so one anchor for all of them keeps
    her small steps and stops her sliding about.
    """
    cells = _cells()
    ref = cells[0]
    bust = ref[:, :, 3] > 128
    bust[:, :BUST_X] = False
    near = _grow(bust, 3)
    out = [_cut(cells[i], ref, near) for i in DUST_CELLS]
    feet = np.asarray(out[-1])[-60:, :BUST_X, 3].any(0)
    xs = np.nonzero(feet)[0]
    return out, int((xs[0] + xs[-1]) / 2)


if __name__ == '__main__':
    fs, foot = frames()
    sheet = Image.new('RGBA', (CELL * len(fs), CELL), (120, 120, 120, 255))
    for k, f in enumerate(fs):
        sheet.paste(f, (k * CELL, 0), f)
    path = os.path.join(os.environ.get('PREVIEW_DIR', '.'), 'dust-preview.png')
    sheet.save(path)
    print(path, 'feet at x =', foot)
