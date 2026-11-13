#!/usr/bin/env python3
"""Take the base's cream SLEEVE off the held pieces that grip.

    python3 scripts/avatar/held-cuff.py       # then layers.py builds

The crook, staves, torch and net were cut from Kontext edits of the base in
its cream suit, and kept a cuff of it at the gripping wrist and a sliver of
it by the hip. Worn, that drew a pale sleeve stub on the hand and a white
streak down the shirt (owner, 2026-11-13). Cream below the chest (a torch's
white-hot flame sits higher) is cleared.
"""
import importlib.util, os, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(__file__)
spec = importlib.util.spec_from_file_location('ss', os.path.join(HERE, 'skin-split.py'))
ss = importlib.util.module_from_spec(spec)
_argv, sys.argv = sys.argv, ['skin-split.py', '--sheet-noop']
spec.loader.exec_module(ss)
sys.argv = _argv

GRIP = ('held_crook', 'held_staff', 'held_star_staff', 'held_torch', 'held_fishing_net')


def fix(folder, lid):
    lay, box = ss.canvas(folder, lid)
    L = ss.lab(lay[..., :3])
    cream = (lay[..., 3] > 0) & (L[..., 0] > 60) & (np.abs(L[..., 1]) < 14) & (L[..., 2] < 28)
    cream[:260] = False
    out = lay.copy()
    out[cream, 3] = 0
    x, y, w, h = box['x'], box['y'], box['w'], box['h']
    return int(cream.sum()), Image.fromarray(out[y:y + h, x:x + w].clip(0, 255).astype(np.uint8), 'RGBA')


if __name__ == '__main__':
    for folder in ('masc', 'fem'):
        for lid in GRIP:
            if lid not in ss.IDX[folder]:
                continue
            n, im = fix(folder, lid)
            if n:
                im.save(os.path.join(ss.AV, folder, lid + '.webp'), 'WEBP', quality=88, method=6)
                print(f'{folder}/{lid}: {n} px', flush=True)
