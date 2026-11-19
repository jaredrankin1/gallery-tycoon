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

import slice_dust
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
        'impressed': [(840, 620), (965, 620)],
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
        'notes': [(190, 600), (325, 600), (475, 600)],
        'chat': [(1465, 600)],
    },
    'hana': {
        'idle': [(60, 425), (143, 425), (225, 425), (317, 425)],
        'walk': [(425, 425), (533, 425), (636, 425), (737, 425), (840, 425), (943, 425)],
        'look': [(505, 790)],  # magnifying glass
        'think': [(1020, 610)],
        'impressed': [(1365, 610)],
        'disapprove': [(1265, 610)],
        'photo': [(75, 790), (215, 790), (355, 790)],
        'notes': [(237, 610), (337, 610), (450, 610), (575, 610)],
        'chat': [(1100, 790), (1240, 790)],
    },
    # The gallery assistant is staff, not a visitor: her own set of animations.
    'assistant': {
        'idle': [(52, 405), (125, 405), (200, 405), (275, 405)],
        'walk': [(385, 405), (495, 405), (605, 405), (715, 405), (825, 405), (935, 405)],
        'clipboard': [(68, 578), (205, 578), (343, 578), (480, 578), (620, 578)],
        'dust': [(615, 750)],
        'wave': [(1000, 575), (1250, 575)],
        'point': [(1420, 575)],
        'cheer': [(1450, 750)],
        'radio': [(740, 580)],
        'crossed': [(1130, 575)],
        'look': [(875, 575)],
    },
}
# Poses the sheets draw from the waist up. They get legs from the standing frame.
WAIST_UP = {
    'sunny': [(1330, 580), (1465, 580)],
    'beatrix': [(420, 620), (560, 620), (1085, 620), (840, 620), (965, 620), (1325, 620), (1210, 620), (60, 620), (185, 620), (300, 620), (710, 620)],
    'kofi': [(1063, 600), (1320, 600), (925, 600), (1195, 600), (1465, 600)],
    'hana': [(1365, 610), (1265, 610), (1100, 790), (1240, 790)],
    'assistant': [(68, 578), (205, 578), (343, 578), (480, 578), (620, 578), (740, 580), (1000, 575), (1250, 575), (1420, 575), (1130, 575), (875, 575)],
}
# (left, top, side) of the square portrait crop.
PORTRAIT = {'sunny': (12, 10, 300), 'beatrix': (12, 24, 300), 'kofi': (8, 10, 296), 'hana': (14, 14, 268), 'assistant': (10, 6, 300)}


# Animations that come from a sheet of their own: animation -> loader returning
# (full-size frames sharing one anchor, feet x). They're scaled to her standing height.
OWN_SHEETS = {'assistant': {'dust': slice_dust.frames}}


def own_frames(load, height):
    """Frames from a separate sheet, cropped together and scaled so she stands `height` tall."""
    fs, feet = load()
    alpha = np.stack([np.asarray(f)[:, :, 3] > 0 for f in fs]).any(0)
    ys, xs = np.nonzero(alpha)
    # Her own height: the last frame is her standing straight.
    last = np.nonzero(np.asarray(fs[-1])[:, :, 3].any(1))[0]
    k = height / (last[-1] - last[0] + 1)
    box = (xs.min(), ys.min(), xs.max() + 1, last[-1] + 1)
    w, h = round((box[2] - box[0]) * k), round((box[3] - box[1]) * k)
    return [f.crop(box).resize((w, h), Image.LANCZOS) for f in fs], round((feet - box[0]) * k)


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


def add_legs(frame, idle):
    """A waist-up pose, drawn a little larger, on top of the legs of a standing frame.

    Finds the scale and offset where the head and shoulders best overlap the
    standing frame's, then draws the standing frame's lower body underneath.
    """
    ia = np.asarray(idle)[:, :, 3] > 0
    best = None
    for s in np.linspace(0.6, 1.1, 26):
        w, h = max(1, round(frame.width * s)), max(1, round(frame.height * s))
        if h >= idle.height:
            continue
        fa = np.asarray(frame.resize((w, h), Image.NEAREST))[:, :, 3] > 0
        top = max(8, int(h * 0.38))  # head and shoulders: arms move, these don't
        for dx in range(-w, idle.width):
            a = fa[:top]
            x0, x1 = max(0, dx), min(idle.width, dx + w)
            if x1 - x0 < w * 0.4:
                continue
            fa_c = a[:, x0 - dx:x1 - dx]
            ia_c = ia[:top, x0:x1]
            inter = (fa_c & ia_c).sum()
            union = a.sum() + ia[:top].sum() - inter
            score = inter / max(1, union)
            if best is None or score > best[0]:
                best = (score, s, dx, w, h)
    _, s, dx, w, h = best
    scaled = frame.resize((w, h), Image.LANCZOS)
    left = min(0, dx)
    W = max(idle.width, dx + w) - left
    out = Image.new('RGBA', (W, idle.height), (0, 0, 0, 0))
    cut = h - 3  # overlap a few rows so there's no seam
    legs = idle.crop((0, cut, idle.width, idle.height))
    out.paste(legs, (-left, cut), legs)
    out.paste(scaled, (dx - left, 0), scaled)
    return out


def build(name):
    rgb, lab, sizes, boxes = figures(name)
    idle = frame_at(rgb, lab, sizes, boxes, FRAMES[name]['idle'][0])
    waist = set(WAIST_UP.get(name, []))

    def get(p):
        f = frame_at(rgb, lab, sizes, boxes, p)
        return add_legs(f, idle) if p in waist else f

    frames = {a: [get(p) for p in pts] for a, pts in FRAMES[name].items()}
    # Feet x for frames that bring their own anchor; the rest are centred on their legs.
    anchor = {}
    if name in OWN_SHEETS:
        for anim, load in OWN_SHEETS[name].items():
            frames[anim], feet = own_frames(load, idle.height)
            for f in frames[anim]:
                anchor[id(f)] = feet
    order = ORDER if set(frames) == set(ORDER) else list(frames)

    def feet_x(f):
        if id(f) in anchor:
            return anchor[id(f)]
        a = np.asarray(f)[:, :, 3] > 0
        lower = a[int(f.height * 0.66):]
        xs = np.where(lower.any(0))[0]
        return int((xs[0] + xs[-1]) / 2) if len(xs) else f.width // 2

    all_f = [f for fs in frames.values() for f in fs]
    cw = max(2 * max(feet_x(f), f.width - feet_x(f)) for f in all_f)
    ch = max(f.height for f in all_f)
    cols = max(len(frames[k]) for k in order)
    sheet = Image.new('RGBA', (cw * cols, ch * len(order)), (0, 0, 0, 0))
    for r, anim in enumerate(order):
        for c, f in enumerate(frames[anim]):
            sheet.paste(f, (c * cw + cw // 2 - feet_x(f), r * ch + ch - f.height), f)
    out_w, out_h = int(cw * SCALE), int(ch * SCALE)
    sheet = sheet.resize((out_w * cols, out_h * len(order)), Image.LANCZOS)
    arr = np.asarray(sheet).copy()
    arr[:, :, 3] = np.where(arr[:, :, 3] > 110, 255, 0)
    Image.fromarray(arr, 'RGBA').quantize(128, method=Image.Quantize.FASTOCTREE).save(os.path.join(OUT, f'{name}.png'), optimize=True)
    l, t, side = PORTRAIT[name]
    Image.fromarray(rgb).crop((l, t, l + side, t + side)).resize((96, 96), Image.LANCZOS).quantize(128).save(
        os.path.join(OUT, f'{name}-portrait.png'), optimize=True
    )
    return {'cell': [out_w, out_h], 'anims': {k: [r, len(frames[k])] for r, k in enumerate(order)}}


if __name__ == '__main__':
    import sys
    path = os.path.join(OUT, 'sprites.json')
    with open(path) as fh:
        meta = json.load(fh)
    for n in sys.argv[1:] or FRAMES:
        meta[n] = build(n)
        print(n, meta[n]['cell'])
    with open(path, 'w') as fh:
        json.dump(meta, fh, indent=1)
