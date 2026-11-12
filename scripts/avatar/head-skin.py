#!/usr/bin/env python3
"""Turn the base body's SKIN baked into headwear layers into shadow.

    python3 scripts/avatar/head-skin.py [--dry]

Every head_* layer was cut from a Kontext edit of the LIGHT base body, so the
forehead, eyes and ears under a brim (and, for the star crown and the halo, a
whole bald head) came out of the subtraction as light skin. Drawn over a
darker tone that band reads lighter than the face under it. Each layer is
compared with the base body pixel beneath it: where it is the same colour
(chroma within a small distance) at any brightness, it was skin, not hat. It
is replaced by black at an alpha that reproduces how much darker it was, i.e.
the brim's real shadow survives and darkens whatever tone is drawn beneath.
Runs over every figure and build folder in public/avatar/.
"""
import json, os, sys
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
AV = os.path.join(ROOT, 'public', 'avatar')
IDX = json.load(open(os.path.join(AV, 'index.json')))
DRY = '--dry' in sys.argv
W, H = IDX['canvas']['w'], IDX['canvas']['h']


def canvas(folder, lid):
    box = IDX[folder].get(lid)
    im = Image.open(os.path.join(AV, folder, lid + '.webp')).convert('RGBA')
    c = np.zeros((H, W, 4), np.float32)
    x, y = box['x'], box['y']
    a = np.asarray(im, np.float32)
    h, w = a.shape[:2]
    c[y:y + h, x:x + w] = a[:max(0, min(h, H - y)), :max(0, min(w, W - x))]
    return c, box


_BASES = {}
RINGS = {'head_halo', 'head_crown_stars', 'head_star_circlet', 'head_laurel', 'head_olive_wreath', 'head_flower_crown'}


def base(folder):
    """The magenta-backed base body the hats were actually cut against
    (art/avatar/bases/<fig>.png, 2x), at canvas size, magenta made transparent.
    Slim and sturdy folders are stretched copies, so they use their figure's
    base stretched the same way is NOT attempted: they are fixed by re-running
    `layers.py builds` from the fixed standard layers."""
    fig = folder.split('_')[0]
    if fig not in _BASES:
        im = Image.open(os.path.join(ROOT, 'art', 'avatar', 'bases', fig + '.png')).convert('RGB').resize((W, H), Image.LANCZOS)
        a = np.asarray(im, np.float32)
        r, g, b = a[..., 0], a[..., 1], a[..., 2]
        mag = (r > 180) & (b > 180) & (g < 110)
        alpha = np.where(mag, 0, 255).astype(np.float32)
        _BASES[fig] = np.dstack([a, alpha])
    return _BASES[fig]


def fix(folder, lid):
    """Below the BRIM, inside the head's outline, the layer is the light base's
    face: replace it with a soft shadow. Neither pixel-matching (Kontext moves
    and relights the head) nor skin-colour detection (tan felt and straw ARE
    skin-coloured) can tell the two apart, but geometry can: a brim, a ring or
    a halo is the one part of a headpiece wider than the head, so the lowest
    such row is where hat ends and leaked face begins. A headpiece with no
    such row (a beanie, a wrap) is left alone."""
    from scipy.ndimage import binary_dilation
    body = base(folder)
    lay, box = canvas(folder, lid)
    la = lay[..., 3] / 255
    headmask = body[..., 3] > 128
    rows = np.where(headmask[:box['y'] + box['h']].any(1))[0]
    top = rows.min() if len(rows) else 0
    # head width: the body's widest row in the top ~90px of the figure (the skull)
    hw = max((headmask[r].sum() for r in range(top, min(top + 90, H))), default=0)
    wide = [r for r in range(box['y'], box['y'] + box['h']) if (la[r] > 0.5).sum() > hw * 1.3]
    if not wide:
        return 0, None
    brim = max(wide)
    head = binary_dilation(headmask, iterations=2)
    out = lay.copy()
    n = 0
    cols = np.where(headmask[top:top + 90].any(0))[0]
    cx = (cols.min() + cols.max()) / 2 if len(cols) else W / 2
    xs = np.arange(W)
    taper = np.clip(1 - np.abs(xs - cx) / (hw / 2 + 1e-3), 0, 1) ** 0.6
    ring = lid in RINGS
    for r in range(brim + 1, box['y'] + box['h']):
        m = head[r] & (la[r] > 0.02)
        if not m.any():
            continue
        fall = 0.0 if ring else max(0.0, 0.38 * (1 - (r - brim) / 11))
        out[r, m, :3] = 0
        out[r, m, 3] = 255 * fall * taper[m]
        n += int(m.sum())
    if ring:
        # A ring floats over a bare scalp, so the scalp it was painted on shows
        # through it too: clear skin-hued pixels inside the head (the gold of a
        # crown or halo sits at hue 40-50, skin at 15-32).
        rgb = out[..., :3] / 255
        mx, mn = rgb.max(-1), rgb.min(-1)
        d = np.maximum(mx - mn, 1e-3)
        r_, g_, b_ = rgb[..., 0], rgb[..., 1], rgb[..., 2]
        hue = np.where(mx == r_, ((g_ - b_) / d) % 6, np.where(mx == g_, (b_ - r_) / d + 2, (r_ - g_) / d + 4)) * 60
        sat = (mx - mn) / np.maximum(mx, 1e-3)
        sk = head & (out[..., 3] > 5) & (hue >= 10) & (hue <= 33) & (sat > 0.3) & (r_ > g_) & (g_ > b_)
        out[sk, 3] = 0
        n += int(sk.sum())
    x, y, w, h = box['x'], box['y'], box['w'], box['h']
    crop = out[y:y + h, x:x + w].clip(0, 255).astype(np.uint8)
    return n, Image.fromarray(crop, 'RGBA')


def main():
    folders = [f for f in ('masc', 'fem') if f in IDX]
    for folder in folders:
        for lid in sorted(k for k in IDX[folder] if k.startswith('head_')):
            n, im = fix(folder, lid)
            if im is None:
                continue
            dst = os.path.join(ROOT, 'art', 'avatar', '.headfix', folder) if DRY else os.path.join(AV, folder)
            os.makedirs(dst, exist_ok=True)
            im.save(os.path.join(dst, lid + '.webp'), 'WEBP', quality=90, method=6)
            if n:
                print(folder, lid, n, flush=True)


if __name__ == '__main__':
    main()
