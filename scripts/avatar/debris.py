#!/usr/bin/env python3
"""Clear cut-out DEBRIS from garment layers (tops, legs, belts).

    python3 scripts/avatar/debris.py      # masc + fem; then layers.py builds

The subtraction that cut each garment off the base left hairlines tracing the
base's arms and legs, a foot outline, and specks at the edges (the apron
carried both arms' outlines and a sandal). Two things are removed:
specks — separate pieces under 2% of the garment's largest piece — and thin
lines — pixels 2px wide or less lying more than 3px from the garment's solid
body. Heads, backs and held pieces are left alone: their separate pieces are
real (the stars of the star crown, two wings, a fist on a pole).
"""
import json, os
import numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation, binary_opening, label

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
AV = os.path.join(ROOT, 'public', 'avatar')
IDX = json.load(open(os.path.join(AV, 'index.json')))
SLOTS = ('top', 'legs', 'belt')

for fig in ('masc', 'fem'):
    for lid in sorted(IDX[fig]):
        if IDX['items'].get(lid, {}).get('slot') not in SLOTS:
            continue
        p = os.path.join(AV, fig, lid + '.webp')
        im = np.asarray(Image.open(p).convert('RGBA')).copy()
        a = im[..., 3] > 20
        lab, n = label(a)
        sizes = np.bincount(lab.ravel())
        sizes[0] = 0
        keep = sizes >= sizes.max() * 0.02
        keep[0] = False
        specks = a & ~keep[lab]
        core = binary_opening(im[..., 3] > 60, iterations=2)
        lines = a & ~binary_dilation(core, iterations=3)
        gone = specks | lines
        if gone.sum() < 20:
            continue
        im[gone, 3] = 0
        Image.fromarray(im, 'RGBA').save(p, 'WEBP', quality=88, method=6)
        print(f'{fig}/{lid}: {int(gone.sum())} px of debris', flush=True)
