#!/usr/bin/env python3
"""Put the gripping fist of a staff, crook, torch or net ON the body's hand.

    python3 scripts/avatar/held-grip.py       # once; then layers.py builds

Each of these pieces was cut with its own raised forearm and fist, from a
Kontext edit in which the base lifted its arm. The body layer's arm hangs
straight, so worn, the fist floated at chest height beside the real arm with
a second forearm under it (owner, 2026-11-13). Here the piece's forearm is
dropped (everything right of the fist, below the top ornament) and the whole
piece is moved so the fist sits over the body's own left hand — the hanging
arm then ends in the fist that holds the pole.

NOT idempotent: it moves the piece by where the fist is now. Run once.
"""
import json, os
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
AV = os.path.join(ROOT, 'public', 'avatar')
IDX_P = os.path.join(AV, 'index.json')
IDX = json.load(open(IDX_P))
W, H = IDX['canvas']['w'], IDX['canvas']['h']
GRIP = ('held_crook', 'held_staff', 'held_star_staff', 'held_torch', 'held_fishing_net')
HAND = (104, 450)   # the body's left hand, canvas (x, y), both figures


def canvas(folder, lid):
    b = IDX[folder][lid]
    a = np.asarray(Image.open(os.path.join(AV, folder, lid + '.webp')).convert('RGBA'))
    c = np.zeros((H, W, 4), np.uint8)
    h, w = min(a.shape[0], H - b['y']), min(a.shape[1], W - b['x'])
    c[b['y']:b['y'] + h, b['x']:b['x'] + w] = a[:h, :w]
    return c


def save(folder, lid, c):
    bb = Image.fromarray(c).getbbox()
    if not bb:
        return
    Image.fromarray(c).crop(bb).save(os.path.join(AV, folder, lid + '.webp'), 'WEBP', quality=88, method=6)
    IDX[folder][lid] = {'h': bb[3] - bb[1], 'w': bb[2] - bb[0], 'x': bb[0], 'y': bb[1]}


def shift(c, dx, dy):
    o = np.zeros_like(c)
    ys, xs = slice(max(0, dy), min(H, H + dy)), slice(max(0, dx), min(W, W + dx))
    yo, xo = slice(max(0, -dy), min(H, H - dy)), slice(max(0, -dx), min(W, W - dx))
    o[ys, xs] = c[yo, xo]
    return o


for folder in ('masc', 'fem'):
    for lid in GRIP:
        if lid not in IDX[folder] or lid + '__skin' not in IDX[folder]:
            continue
        item, skin = canvas(folder, lid), canvas(folder, lid + '__skin')
        ys, xs = np.where(skin[..., 3] > 60)
        # the fist: the skin layer's largest blob near its median row
        my = int(np.median(ys))
        near = np.abs(ys - my) < 30
        fy0, fy1, fx0, fx1 = ys[near].min(), ys[near].max(), xs[near].min(), xs[near].max()
        yy, xx = np.mgrid[0:H, 0:W]
        keep = (xx <= fx1 + 2) | (yy < fy0 - 20)
        item[~keep] = 0
        skin[~keep] = 0
        dx, dy = HAND[0] - (fx0 + fx1) // 2, HAND[1] - (fy0 + fy1) // 2
        save(folder, lid, shift(item, dx, dy))
        save(folder, lid + '__skin', shift(skin, dx, dy))
        print(f'{folder}/{lid}: fist ({(fx0 + fx1) // 2},{(fy0 + fy1) // 2}) moved by ({dx},{dy})')

open(IDX_P, 'w').write(json.dumps(IDX, indent=1, sort_keys=True) + '\n')
