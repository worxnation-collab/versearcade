#!/usr/bin/env python3
"""Clear the base body's skin baked into clothing layers.

    python3 scripts/avatar/cloth-skin.py [--dry]

The doc's rule is that a clothing layer never keeps the body's skin, and the
2026-11-11 drop broke it: arms in t-shirts, legs and feet under robes and the
dress, a raincoat with legs in it. Drawn over a darker tone they read as light
patches. A TINTED piece is stored grey and coloured at runtime, so any warm,
saturated pixel in it is skin, never garment: those are cleared outright.
Full-colour pieces are NOT touched: leather boots, a tool belt and the coat of
many colours lost real garment to a hue test on the first try (2026-11-12).
Tops and legs only: shoes, belts and back items are full colour or hidden.
Then `layers.py builds` re-derives slim and sturdy.
"""
import json, os, sys
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
AV = os.path.join(ROOT, 'public', 'avatar')
IDX = json.load(open(os.path.join(AV, 'index.json')))
META = IDX['items']
DRY = '--dry' in sys.argv
SLOTS = ('top', 'legs', 'head')
HEM_CUT = {'top_explorer_jacket'}
SKIP = {'head_traveller_hat', 'top_armor_full', 'top_breastplate', 'top_chainmail', 'top_lion_armor', 'top_work_apron'}  # metal and leather: hue overlaps skin


def hue_sat(a):
    rgb = a[..., :3] / 255
    mx, mn = rgb.max(-1), rgb.min(-1)
    d = np.maximum(mx - mn, 1e-3)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    hue = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    sat = (mx - mn) / np.maximum(mx, 1e-3)
    return hue, sat, r, g, b, mx


def fix(folder, lid):
    box = IDX[folder][lid]
    a = np.asarray(Image.open(os.path.join(AV, folder, lid + '.webp')).convert('RGBA'), np.float32)
    hue, sat, r, g, b, mx = hue_sat(a)
    skin = (a[..., 3] > 5) & (hue >= 5) & (hue <= 40) & (sat > 0.32) & (r > g) & (g >= b) & (mx > 0.2)
    n = int(skin.sum())
    if n:
        a[skin, 3] = 0
    # A coat the model painted trousers under: below the hem (the last row as
    # wide as 55% of the coat) only the two legs remain, and they are trousers.
    if lid in HEM_CUT:
        w = (a[..., 3] > 128).sum(1)
        wide = np.where(w > 0.55 * w.max())[0]
        if len(wide):
            hem = int(wide.max()) + 3
            n += int((a[hem:, :, 3] > 0).sum())
            a[hem:, :, 3] = 0
    return n, Image.fromarray(a.clip(0, 255).astype(np.uint8), 'RGBA')


def main():
    for folder in ('masc', 'fem'):
        for lid in sorted(IDX[folder]):
            m = META.get(lid, {})
            if lid in SKIP or m.get('slot') not in SLOTS or not m.get('tint'):
                continue
            n, im = fix(folder, lid)
            if n < 30:
                continue
            dst = os.path.join(ROOT, 'art', 'avatar', '.clothfix', folder) if DRY else os.path.join(AV, folder)
            os.makedirs(dst, exist_ok=True)
            im.save(os.path.join(dst, lid + '.webp'), 'WEBP', quality=90, method=6)
            print(folder, lid, n, flush=True)


if __name__ == '__main__':
    main()
