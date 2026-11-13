#!/usr/bin/env python3
"""Three leftovers on the headwear, found worn on ebony (2026-11-13):

    python3 scripts/avatar/head-polish.py [--dry]
    python3 scripts/avatar/layers.py builds      # slim/sturdy are copies

1. FOREHEAD. head-face.py clears the face from the brow DOWN. Between a high
   brim and the brow the Kontext edit still carried the LIGHT base's forehead,
   which drew as a light band under every cowboy, explorer, straw and
   traveller hat on a dark tone. A hat pixel that matches the base body at
   the same spot (and the base there is skin) is that forehead: cleared, so
   the player's own forehead and hair show under the brim.
2. RING CENTRES. The halo and the star crown were painted with an opaque
   dark disc inside the ring, drawn over the top of the hair, so the hair
   looked sliced flat. Everything inside the ring that is not gold goes.
3. CRUMBS. Disconnected bits of cheek guard and ear left after the face cut
   (white tabs beside the winged helm's jaw, the feather cap's ear) read as
   earrings. Components under 4% of the piece's largest are dropped — never
   on pieces MADE of separate parts (stars, flowers, leaves).
"""
import importlib.util, os, sys
import numpy as np
from PIL import Image
from scipy.ndimage import binary_erosion, label

HERE = os.path.dirname(__file__)
spec = importlib.util.spec_from_file_location('hs', os.path.join(HERE, 'head-skin.py'))
hs = importlib.util.module_from_spec(spec)
_argv, sys.argv = sys.argv, ['head-skin.py', '--dry']
spec.loader.exec_module(hs)
sys.argv = _argv
DRY = '--dry' in sys.argv

BROW = 141
CUT = {'head_explorer_hat': 1, 'head_traveler_hat': 1, 'head_traveller_hat': 1, 'head_feather_cap': 1,
       'head_straw_hat': 1, 'head_cowboy_hat': 1, 'head_fisher_cap': 1, 'head_cap': 1, 'head_bandana': 1,
       'head_work_bandana': 1, 'head_knight_helm': 7, 'head_winged_helm': 1, 'head_dragon_helm': 3}
RING_DISC = {'head_halo', 'head_crown_stars'}
MANY_PARTS = {'head_crown_stars', 'head_flower_crown', 'head_laurel', 'head_olive_wreath', 'head_star_circlet', 'head_halo', 'head_goggles'}


def lab(rgb):
    rgb = rgb / 255.0
    lin = np.where(rgb > 0.04045, ((rgb + 0.055) / 1.055) ** 2.4, rgb / 12.92)
    M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = lin @ M.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def fix(folder, lid):
    lay, box = hs.canvas(folder, lid)
    out = lay.copy()
    n = 0
    solid = out[..., 3] > 8
    if lid in RING_DISC:
        r, g, b = out[..., 0], out[..., 1], out[..., 2]
        # the disc is dark violet (r ~ b); the ring is gold or, on the fem
        # halo, nearly white — so: dark and not saturated gold
        luma = 0.299 * r + 0.587 * g + 0.114 * b
        m = solid & (luma < 150) & ~((r - b > 70) & (r > 120))
        out[m, 3] = 0
        n += int(m.sum())
    else:
        base = hs.base(folder)
        bm = binary_erosion(base[..., 3] > 128, iterations=2)
        bl, ll = lab(base[..., :3]), lab(out[..., :3])
        skin = (bl[..., 1] > 8) & (bl[..., 2] > 10) & (bl[..., 0] > 45)
        d = np.sqrt(((bl - ll) ** 2).sum(-1))
        rows = np.zeros_like(solid)
        rows[60:BROW + 4] = True
        m = solid & bm & skin & rows & (d < 11) & (lid in CUT)
        out[m, 3] = 0
        n += int(m.sum())
        # The SHADED forehead: Kontext darkened the base's skin under the
        # brim rather than copying it, so it fails the match above. Saturated
        # skin hue in the rows just above the brow, inside the head, becomes
        # the brim's shadow — black at the alpha head-face.py fades in below.
        if lid in CUT:
            rgb = out[..., :3] / 255
            mx, mn = rgb.max(-1), rgb.min(-1)
            dd = np.maximum(mx - mn, 1e-3)
            hue = np.where(mx == rgb[..., 0], ((rgb[..., 1] - rgb[..., 2]) / dd) % 6, 9) * 60
            sat = (mx - mn) / np.maximum(mx, 1e-3)
            band = np.zeros_like(solid)
            band[BROW - 18:BROW] = True
            sh = solid & band & binary_erosion(base[..., 3] > 128, iterations=CUT[lid]) & (hue >= 8) & (hue <= 40) & (sat > 0.5) & (mx > 0.35)
            # only the band that reaches the brow: brim pixels of the same
            # hue higher up are hat, not forehead
            lb, nb = label(sh)
            keep = np.unique(lb[BROW - 3:BROW][sh[BROW - 3:BROW]])
            sh = np.isin(lb, keep[keep > 0])
            out[sh, :3] = 0
            out[sh, 3] = 255 * 0.34
            n += int(sh.sum())
    if lid == 'head_flower_crown':
        # the flowers sit on a strip of the base's forehead: saturated skin
        # hue inside the head (flowers are white, yellow, violet and green)
        rgb = out[..., :3] / 255
        mx, mn = rgb.max(-1), rgb.min(-1)
        dd = np.maximum(mx - mn, 1e-3)
        hue = np.where(mx == rgb[..., 0], ((rgb[..., 1] - rgb[..., 2]) / dd) % 6, 9) * 60
        sat = (mx - mn) / np.maximum(mx, 1e-3)
        sk = solid & (hs.base(folder)[..., 3] > 128) & (hue >= 10) & (hue <= 38) & (sat > 0.35) & (mx > 0.3)
        out[sk, 3] = 0
        n += int(sk.sum())
    if lid not in MANY_PARTS:
        s = out[..., 3] > 20
        lab_, k = label(s)
        if k > 1:
            sizes = np.bincount(lab_.ravel())[1:]
            small = np.isin(lab_, np.where(sizes < sizes.max() * 0.04)[0] + 1)
            out[small, 3] = 0
            n += int(small.sum())
    x, y, w, h = box['x'], box['y'], box['w'], box['h']
    return n, Image.fromarray(out[y:y + h, x:x + w].clip(0, 255).astype(np.uint8), 'RGBA')


def main():
    for folder in ('masc', 'fem'):
        for lid in sorted(k for k in hs.IDX[folder] if k.startswith('head_') and '__' not in k):
            n, im = fix(folder, lid)
            if not n:
                continue
            print(f'{folder}/{lid}: {n} px', flush=True)
            if not DRY:
                im.save(os.path.join(hs.AV, folder, lid + '.webp'), 'WEBP', quality=88, method=6)


if __name__ == '__main__':
    main()
