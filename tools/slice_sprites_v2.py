"""Slice the second style of character sheet (art/source/v2/) into game atlases.

    python3 tools/slice_sprites_v2.py

These sheets are free-form: a portrait, a turnaround, expressions, then rows
of poses with props, not in a fixed grid. So we find every figure as a
connected shape (same background removal as slice_sprites.py) and pick the
frames for each animation by pointing at them: each (x, y) below is a spot
inside the figure on the 1536x1024 sheet. Small detached bits (music notes,
sparkles) inside a figure's box come with it; props standing beside a
figure (statues, paintings) are separate shapes and are left out.

Writes src/assets/sprites/<name>.png and -portrait.png, and adds each
character to sprites.json.
"""
import json
import os

import numpy as np
from PIL import Image

from slice_sprites import OUT, ROOT, SCALE, flood_background, label

SRC = os.path.join(ROOT, 'art', 'source', 'v2')
ORDER = ['idle', 'walk', 'look', 'think', 'impressed', 'disapprove', 'photo', 'notes', 'chat']

# Animation -> points inside each frame, in play order.
FRAMES = {
    'sunny': {
        'idle': [(50, 410), (140, 410), (228, 410), (316, 410)],
        'walk': [(430, 410), (523, 410), (610, 410), (698, 410), (785, 410), (885, 410)],
        'look': [(1175, 760), (1372, 760)],  # waving at a painting
        'think': [(1008, 580), (870, 580), (1180, 590)],  # meditating
        'impressed': [(527, 930)],  # peace signs
        'disapprove': [(740, 940)],  # lies down for a nap
        'photo': [(77, 750), (232, 750), (382, 750), (538, 750)],
        'notes': [(690, 750), (850, 760), (995, 760)],
        'chat': [(1330, 580), (1465, 580)],
    },
    'beatrix': {
        'idle': [(78, 440), (186, 440), (293, 440), (400, 440)],
        'walk': [(540, 440), (648, 440), (742, 440), (840, 440), (942, 440)],
        'look': [(420, 620), (560, 620)],
        'think': [(295, 800), (1085, 620)],
        'impressed': [(840, 620), (965, 620), (1450, 620)],
        'disapprove': [(1325, 620), (1210, 620)],
        'photo': [(630, 800), (785, 800), (945, 800)],
        'notes': [(60, 620), (185, 620), (300, 620)],
        'chat': [(710, 620), (965, 620)],
    },
    'kofi': {
        'idle': [(58, 415), (150, 415), (243, 415), (337, 415)],
        'walk': [(452, 415), (547, 415), (645, 415), (752, 415), (855, 415), (955, 415)],
        'look': [(1063, 600), (1320, 600)],  # headphones on, taking it in
        'think': [(925, 600)],
        'impressed': [(700, 780)],  # pointing it out
        'disapprove': [(1195, 600)],  # arms crossed
        'photo': [(210, 780), (365, 780), (520, 780)],
        'notes': [(65, 600), (190, 600), (325, 600), (475, 600)],
        'chat': [(1465, 600)],
    },
    'hana': {
        'idle': [(60, 425), (143, 425), (225, 425), (317, 425)],
        'walk': [(425, 425), (533, 425), (636, 425), (737, 425), (840, 425), (943, 425)],
        'look': [(505, 790)],  # magnifying glass
        'think': [(1020, 610), (1143, 610)],
        'impressed': [(1365, 610), (1475, 610)],
        'disapprove': [(1265, 610)],
        'photo': [(75, 790), (215, 790), (355, 790)],
        'notes': [(237, 610), (337, 610), (450, 610), (575, 610)],
        'chat': [(1100, 790), (1240, 790)],
    },
}
# (left, top, side) of the square portrait crop.
PORTRAIT = {'sunny': (12, 10, 300), 'beatrix': (12, 24, 300), 'kofi': (8, 10, 296), 'hana': (14, 14, 268)}


def figures(name):
    img = Image.open(os.path.join(SRC, f'{name}.png')).convert('RGB')
    rgb = np.asarray(img)
    fg = ~flood_background(rgb.astype(np.int16))
    lab, sizes = label(fg)
    boxes = {}
    ys, xs = np.nonzero(lab)
    ids = lab[ys, xs]
    for i in np.unique(ids):
        sel = ids == i
        boxes[int(i)] = (xs[sel].min(), ys[sel].min(), xs[sel].max(), ys[sel].max())
    return rgb, lab, sizes, boxes


def frame_at(rgb, lab, sizes, boxes, pt):
    x, y = pt
    # the biggest shape whose box holds the point
    hits = [i for i, (x0, y0, x1, y1) in boxes.items() if x0 <= x <= x1 and y0 <= y <= y1 and sizes[i] >= 800]
    if not hits:
        raise SystemExit(f'nothing at {pt}')
    i = max(hits, key=lambda k: sizes[k])
    x0, y0, x1, y1 = boxes[i]
    mask = lab == i
    # bring along small detached bits that sit inside this figure's box
    for j, (a, b, c, d) in boxes.items():
        if j != i and sizes[j] < 800 and a >= x0 and c <= x1 and b >= y0 and d <= y1:
            mask |= lab == j
    m = mask[y0:y1 + 1, x0:x1 + 1]
    rgba = np.dstack([rgb[y0:y1 + 1, x0:x1 + 1], (m * 255).astype(np.uint8)])
    return Image.fromarray(rgba, 'RGBA')


def build(name):
    rgb, lab, sizes, boxes = figures(name)
    frames = {a: [frame_at(rgb, lab, sizes, boxes, p) for p in pts] for a, pts in FRAMES[name].items()}
    all_f = [f for fs in frames.values() for f in fs]
    cw = max(f.width for f in all_f)
    ch = max(f.height for f in all_f)
    cols = max(len(frames[k]) for k in ORDER)
    sheet = Image.new('RGBA', (cw * cols, ch * len(ORDER)), (0, 0, 0, 0))
    for r, anim in enumerate(ORDER):
        for c, f in enumerate(frames[anim]):
            a = np.asarray(f)[:, :, 3] > 0
            lower = a[int(f.height * 0.66):]
            xs = np.where(lower.any(0))[0]
            cx = int((xs[0] + xs[-1]) / 2) if len(xs) else f.width // 2
            sheet.paste(f, (c * cw + cw // 2 - cx, r * ch + ch - f.height), f)
    out_w, out_h = int(cw * SCALE), int(ch * SCALE)
    sheet = sheet.resize((out_w * cols, out_h * len(ORDER)), Image.LANCZOS)
    arr = np.asarray(sheet).copy()
    arr[:, :, 3] = np.where(arr[:, :, 3] > 110, 255, 0)
    Image.fromarray(arr, 'RGBA').quantize(128, method=Image.Quantize.FASTOCTREE).save(os.path.join(OUT, f'{name}.png'), optimize=True)
    l, t, side = PORTRAIT[name]
    Image.fromarray(rgb).crop((l, t, l + side, t + side)).resize((96, 96), Image.LANCZOS).quantize(128).save(
        os.path.join(OUT, f'{name}-portrait.png'), optimize=True
    )
    return {'cell': [out_w, out_h], 'anims': {k: [r, len(frames[k])] for r, k in enumerate(ORDER)}}


if __name__ == '__main__':
    path = os.path.join(OUT, 'sprites.json')
    with open(path) as fh:
        meta = json.load(fh)
    for n in FRAMES:
        meta[n] = build(n)
        print(n, meta[n]['cell'])
    with open(path, 'w') as fh:
        json.dump(meta, fh, indent=1)
