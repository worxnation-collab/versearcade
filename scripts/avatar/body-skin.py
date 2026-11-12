#!/usr/bin/env python3
"""Paint the base's cream BODYSUIT out of the arms and legs of every body layer.

    python3 scripts/avatar/body-skin.py     # masc + fem, every tone; then layers.py builds

The base body wears a full-length cream suit, wrist to ankle, and every tone
variant (body, body_amber … body_ebony) kept it. Anything short-sleeved, a
pair of shorts or a dress therefore showed cream "sleeves" and "leggings" on
every player — read on an ebony figure as pale patches on the forearms.

Below the shoulder seam on the arms, and below the crotch on the legs, suit
pixels (no red in them: Lab a* < 9) are repainted as THAT layer's own skin:
its colour measured off the hands and face of the same image, its shading
kept from the cloth's folds so the limb stays round. The torso stays cream —
under an open robe it reads as an undershirt, and bare would read as a
mannequin. Regions are canvas coordinates measured off the standard figures
(the arms part from the torso at y~315 between x 127 and 234; the legs part
at y~450); slim/sturdy are regenerated from these by layers.py builds.
"""
import json, os
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
AV = os.path.join(ROOT, 'public', 'avatar')
IDX = json.load(open(os.path.join(AV, 'index.json')))
W, H = IDX['canvas']['w'], IDX['canvas']['h']


def lab(rgb):
    rgb = rgb / 255.0
    lin = np.where(rgb > 0.04045, ((rgb + 0.055) / 1.055) ** 2.4, rgb / 12.92)
    M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = lin @ M.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def rgb_from_lab(L):
    fy = (L[..., 0] + 16) / 116
    fx = fy + L[..., 1] / 500
    fz = fy - L[..., 2] / 200
    f = np.stack([fx, fy, fz], -1)
    xyz = np.where(f ** 3 > 0.008856, f ** 3, (f - 16 / 116) / 7.787) * np.array([0.95047, 1.0, 1.08883])
    Mi = np.array([[3.2406, -1.5372, -0.4986], [-0.9689, 1.8758, 0.0415], [0.0557, -0.2040, 1.0570]])
    lin = np.clip(xyz @ Mi.T, 0, 1)
    srgb = np.where(lin > 0.0031308, 1.055 * lin ** (1 / 2.4) - 0.055, 12.92 * lin)
    return np.clip(srgb * 255, 0, 255)


def regions():
    y, x = np.mgrid[0:H, 0:W]
    arms = (y >= 232) & (y < 470) & ((x < 127) | (x > 234))
    legs = (y >= 452) & (y < 700)
    return arms | legs


def fix(fig, lid):
    box = IDX[fig][lid]
    im = np.asarray(Image.open(os.path.join(AV, fig, lid + '.webp')).convert('RGBA'), np.float32)
    h, w = im.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    cy, cx = yy + box['y'], xx + box['x']
    L = lab(im[..., :3])
    solid = im[..., 3] > 0
    # Each limb is suit from where it starts down to its cuff. The cuff is
    # found per limb: the lowest row where most of the limb is still cloth
    # (loosely: little red, light). Everything above it in the limb is suit,
    # whatever its exact colour — porcelain skin and the pinkish cream suit
    # overlap, so colour alone left the limbs patchy.
    clothy = solid & (L[..., 1] < 13) & (L[..., 2] < 20) & (L[..., 0] > 55)
    # this tone's skin, off the face and the hands below the cuffs — never a
    # cloth pixel, or the pinkish suit pulls every limb light
    ref = solid & ~clothy & (im[..., 3] > 250) & (L[..., 1] > 9) & (L[..., 2] > 12) \
        & (cy > 420) & (cy < 480) & ((cx < 120) | (cx > 240))   # the hands: the limb's own neighbours
    sk = np.median(L[ref], 0)
    m = np.zeros_like(solid)
    band = np.zeros_like(solid)     # rows either side of each cuff, to blend the fold line away
    limbs = [((cx < 123) & (cy >= 220) & (cy < 470)), ((cx > 238) & (cy >= 220) & (cy < 470)),
             ((cx < 180) & (cy >= 452) & (cy < 700)), ((cx >= 180) & (cy >= 452) & (cy < 700))]
    for zone in limbs:
        zs = zone & solid
        rows = [r for r in np.unique(yy[zs]) if clothy[r][zs[r]].mean() > 0.5]
        if not rows:
            continue
        cuff = max(rows)
        m |= zs & (yy <= cuff)
        # the cuff's own light rim, a few rows under the last cloth row
        m |= zs & (yy > cuff) & (yy <= cuff + 9) & (L[..., 0] > 42) & (L[..., 1] < 16) & (L[..., 2] < 24)
        band |= zs & (yy >= cuff - 4) & (yy <= cuff + 7)
    if not m.any():
        return 0
    from scipy.ndimage import gaussian_filter, binary_erosion
    sm = L[m][:, 0].mean()
    # Skin, not cloth: the suit's wrinkles kept at full strength read as a
    # sleeve, so the light and shade are BLURRED and halved — the limb stays
    # round, the fabric goes. The silhouette's own dark outline is kept.
    Lb = gaussian_filter(np.where(solid, L[..., 0], sm), 3)
    inner = binary_erosion(solid, iterations=2)
    new = L.copy()
    new[..., 0] = np.clip(sk[0] + (Lb - sm) * 0.45, 3, 98)
    new[..., 1] = sk[1]
    new[..., 2] = sk[2]
    paint = m & inner
    rgb = rgb_from_lab(new)
    out = im.copy()
    out[paint, :3] = rgb[paint]
    # across each cuff, smooth what was left (the fold line sits on the skin side)
    out[..., :3] = np.where((band & inner)[..., None], gaussian_filter(out[..., :3], (2, 2, 0)), out[..., :3])
    # The hips: below the navel the suit is never skin (it is what any legwear
    # covers) — painted a dark undergarment so greaves read as worn over
    # shorts and the gap under a short top reads as shadow, not cream.
    # the whole band, cloth or shadow, but never a hand hanging beside it
    handish = (L[..., 1] > 12) & (L[..., 2] > 14) & ~clothy & ((cx < 126) | (cx > 234))
    hips = solid & (cy >= 405) & (cy < 500) & (cx >= 110) & (cx <= 250) & ~m & ~handish
    if hips.any():
        hl = L[hips][:, 0].mean()
        under = L.copy()
        under[..., 0] = np.clip(24 + (L[..., 0] - hl) * 0.5, 4, 60)
        under[..., 1] = 4
        under[..., 2] = 6
        out[hips, :3] = rgb_from_lab(under)[hips]
    Image.fromarray(out.astype(np.uint8), 'RGBA').save(os.path.join(AV, fig, lid + '.webp'), 'WEBP', quality=90, method=6)
    return int(m.sum())


if __name__ == '__main__':
    for fig in ('masc', 'fem'):
        for lid in sorted(k for k in IDX[fig] if k == 'body' or k.startswith('body_')):
            print(f'{fig}/{lid}: {fix(fig, lid)} px repainted', flush=True)
