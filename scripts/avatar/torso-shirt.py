#!/usr/bin/env python3
"""Repaint the base's cream UNDERSHIRT heather grey on every body layer.

    python3 scripts/avatar/torso-shirt.py      # then layers.py builds

body-skin.py made the limbs skin and left the torso as the suit's cream, on
the reading that under an open coat it is an undershirt. Worn on a dark tone
it read as a PALE CHEST instead — the V of a vest, the gap of a toga, the
belly under the lion breastplate (owner, 2026-11-13). Cream is a skin colour
on half the tones; grey is a colour no tone has, so it can only be cloth.
Shading is kept (halved) so the shirt keeps its folds.
"""
import importlib.util, os, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(__file__)
spec = importlib.util.spec_from_file_location('bs', os.path.join(HERE, 'body-skin.py'))
bs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bs)


def fix(fig, lid):
    box = bs.IDX[fig][lid]
    p = os.path.join(bs.AV, fig, lid + '.webp')
    im = np.asarray(Image.open(p).convert('RGBA'), np.float32)
    h, w = im.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    cy, cx = yy + box['y'], xx + box['x']
    L = bs.lab(im[..., :3])
    solid = im[..., 3] > 0
    cloth = solid & (L[..., 1] < 12) & (L[..., 2] < 22) & (L[..., 0] > 50)
    from scipy.ndimage import binary_closing, binary_fill_holes
    # the torso column: the arms part from it at x 127 / 234 (body-skin.py)
    col = (cx >= 128) & (cx <= 233) & (cy >= 214) & (cy < 405)
    skinlike = (L[..., 1] > 12) & (L[..., 2] > 15)
    m = solid & col & ~(skinlike & (cy < 250))
    if not m.any():
        return 0
    m = binary_fill_holes(binary_closing(m, iterations=2)) & solid & col & ~(skinlike & (cy < 250))
    # cream left on the arms' inner edges, just outside the column, is skin
    stray = solid & ~col & (cy >= 214) & (cy < 405) & (cx >= 118) & (cx <= 243) & cloth
    ref = solid & ~cloth & (im[..., 3] > 250) & (L[..., 1] > 9) & (L[..., 2] > 12) \
        & (cy > 420) & (cy < 480) & ((cx < 120) | (cx > 240))
    sk = np.median(L[ref], 0)
    mean = L[m][:, 0].mean()
    new = L.copy()
    new[..., 0] = np.clip(60 + (L[..., 0] - mean) * 0.6, 20, 85)
    new[..., 1] = 0.5
    new[..., 2] = -2.5
    rgb = bs.rgb_from_lab(new)
    out = im.copy()
    out[m, :3] = rgb[m]
    skin = L.copy()
    skin[..., 0] = np.clip(sk[0] + (L[..., 0] - L[stray][:, 0].mean() if stray.any() else 0) * 0.45, 3, 98)
    skin[..., 1], skin[..., 2] = sk[1], sk[2]
    srgb = bs.rgb_from_lab(skin)
    out[stray, :3] = srgb[stray]
    Image.fromarray(out.astype(np.uint8), 'RGBA').save(p, 'WEBP', quality=90, method=6)
    return int(m.sum())


if __name__ == '__main__':
    for fig in ('masc', 'fem'):
        for lid in sorted(k for k in bs.IDX[fig] if k == 'body' or k.startswith('body_')):
            print(f'{fig}/{lid}: {fix(fig, lid)} px', flush=True)
