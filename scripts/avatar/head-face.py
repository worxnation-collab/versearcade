#!/usr/bin/env python3
"""Take the LEAKED FACE out of headwear layers.

    python3 scripts/avatar/head-face.py [--dry]
    python3 scripts/avatar/layers.py builds      # then: slim/sturdy are copies

Every head_* layer was cut from a Kontext edit of the light base body, and on
several of them the subtraction kept the face under the brim — eyes, nose and
light skin — so a player wearing the explorer hat had a second, lighter face
painted over their own (and, where head-skin.py had cleared the rows below a
drooping brim, a dark band across the mouth that read as a moustache).
head-skin.py looked for the brim's LAST wide row; a wide brim droops at its
tips well below the eyes, so that row was the chin and the face survived.

The rule here does not look for the brim. The base body's eyebrows sit at
canvas row ~145 on both figures (measured off art/avatar/bases), so:

  CUT   (felt and straw hats, which are skin-coloured, so hue can't tell):
        inside the head's outline, every pixel from BROW down is the face.
        A soft shadow fades in over the band just above the brow so the brim
        still shades the forehead of whatever tone is drawn under it.
  SKIN  (metal, cloth and gold pieces, where the face shows through an
        opening): inside the head's outline, below the crown of the skull,
        clear skin-hued pixels — light skin is low-saturation, so the test is
        warm hue + r>g>b, not saturation.
  CLEAR (the star crown, drawn round a whole leaked head): everything inside
        the head's outline below the stars.
"""
import importlib.util, os, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(__file__)
spec = importlib.util.spec_from_file_location('hs', os.path.join(HERE, 'head-skin.py'))
hs = importlib.util.module_from_spec(spec)
_argv, sys.argv = sys.argv, ['head-skin.py', '--dry']
spec.loader.exec_module(hs)
sys.argv = _argv
DRY = '--dry' in sys.argv

BROW = 141
CUT = {'head_explorer_hat': 1, 'head_traveler_hat': 1, 'head_traveller_hat': 1, 'head_feather_cap': 1,
       'head_straw_hat': 1, 'head_cowboy_hat': 1, 'head_fisher_cap': 1,
       'head_cap': 1, 'head_bandana': 1, 'head_work_bandana': 1,
       # a helm's cheek guards are inside the head's outline: keep a wider rim
       'head_knight_helm': 7}
SKIN = set()
CLEAR = {'head_crown_stars': (118, 8), 'head_halo': (118, 16)}
# Not skin-coloured themselves, so below the brow and just outside the head's
# outline (a jaw or ear Kontext moved) skin hue is safe to clear.
JAW = {'head_feather_cap', 'head_knight_helm'}


def skinlike(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx, mn = rgb.max(-1), rgb.min(-1)
    d = np.maximum(mx - mn, 1e-3)
    hue = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    sat = (mx - mn) / np.maximum(mx, 1e-3)
    return (hue >= 8) & (hue <= 38) & (sat > 0.12) & (r > g) & (g > b) & (r > 0.35)


def fix(folder, lid):
    from scipy.ndimage import binary_dilation, binary_erosion
    body = hs.base(folder)
    hm = body[..., 3] > 128
    lay, box = hs.canvas(folder, lid)
    out = lay.copy()
    n = 0
    if lid in CUT:
        # The head minus a 3px rim, so a brim lying across the temples keeps
        # its edge; the rim itself is face too below the brow.
        inner = binary_erosion(hm, iterations=CUT[lid])
        for r in range(BROW - 8, hs.H):
            m = inner[r] & (out[r, :, 3] > 0)
            if not m.any():
                continue
            if r < BROW:
                # the band just above the brow: hat pixels stay, but are
                # shaded toward the brim's shadow rather than lit skin
                continue
            fall = max(0.0, 0.34 * (1 - (r - BROW) / 9))
            out[r, m, :3] = 0
            out[r, m, 3] = 255 * fall
            n += int(m.sum())
        if lid in JAW:
            near = binary_dilation(hm, iterations=14)
            near[:BROW] = False
            sk = near & (out[..., 3] > 5) & skinlike(out[..., :3] / 255)
            out[sk, 3] = 0
            n += int(sk.sum())
    elif lid in SKIN:
        head = binary_dilation(hm, iterations=3)
        head[:118] = False   # the crown of the skull: a cap's crown is cloth there
        sk = head & (out[..., 3] > 5) & skinlike(out[..., :3] / 255)
        out[sk, 3] = 0
        n = int(sk.sum())
    elif lid in CLEAR:
        top, grow = CLEAR[lid]
        head = binary_dilation(hm, iterations=grow)
        head[:top] = False
        m = head & (out[..., 3] > 0)
        out[m, 3] = 0
        n = int(m.sum())
    else:
        return 0, None
    x, y, w, h = box['x'], box['y'], box['w'], box['h']
    return n, Image.fromarray(out[y:y + h, x:x + w].clip(0, 255).astype(np.uint8), 'RGBA')


def main():
    for folder in ('masc', 'fem'):
        for lid in sorted(k for k in hs.IDX[folder] if k.startswith('head_')):
            n, im = fix(folder, lid)
            if im is None or not n:
                continue
            print(f'{folder}/{lid}: {n} px', flush=True)
            if not DRY:
                im.save(os.path.join(hs.AV, folder, lid + '.webp'), 'WEBP', quality=88, method=6)


if __name__ == '__main__':
    main()
