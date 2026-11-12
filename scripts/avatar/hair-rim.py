#!/usr/bin/env python3
"""Take the light base's forehead EDGE off hair layers.

    python3 scripts/avatar/hair-rim.py      # masc + fem, then layers.py builds

Every hair layer was cut from a Kontext edit of the light base, and most kept
a 1-3px line of its forehead and temples along the inside of the hairline.
Hair is drawn through the tint filter (its luminance times the chosen
colour), so that light line came out as a bright outline round the face in
the hair's own colour, and on a dark tone it ringed the face.

Only the band touching the face opening is examined: transparent pixels
inside the head's outline are the face, and a hair pixel within 4px of them
that is warm and light like the base's skin is the rim. Ginger and auburn
hair is the same hue as skin, which is why nothing deeper than that band is
touched.
"""
import importlib.util, os, sys
import numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation

HERE = os.path.dirname(__file__)
spec = importlib.util.spec_from_file_location('ss', os.path.join(HERE, 'skin-split.py'))
ss = importlib.util.module_from_spec(spec)
_argv, sys.argv = sys.argv, ['skin-split.py', '--sheet-noop']
spec.loader.exec_module(ss)
sys.argv = _argv


def fix(folder, lid):
    _, _, body, _ = ss.model(folder)
    lay, box = ss.canvas(folder, lid)
    head = body.copy()
    head[215:] = False
    face = head & (lay[..., 3] < 30)
    band = binary_dilation(face, iterations=4) & (lay[..., 3] > 0)
    L = ss.lab(lay[..., :3])
    rim = band & (L[..., 0] > 40) & (L[..., 1] > 4) & (L[..., 2] > 10)
    out = lay.copy()
    out[rim, 3] = 0
    x, y, w, h = box['x'], box['y'], box['w'], box['h']
    return int(rim.sum()), Image.fromarray(out[y:y + h, x:x + w].clip(0, 255).astype(np.uint8), 'RGBA')


def main():
    for folder in ('masc', 'fem'):
        for lid in sorted(k for k in ss.IDX[folder] if k.startswith('hair_') and '__' not in k):
            n, im = fix(folder, lid)
            if n:
                im.save(os.path.join(ss.AV, folder, lid + '.webp'), 'WEBP', quality=88, method=6)
                print(f'{folder}/{lid}: {n} px of rim', flush=True)


if __name__ == '__main__':
    main()
