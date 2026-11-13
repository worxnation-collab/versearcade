#!/usr/bin/env python3
"""Drop the loose bits of every wardrobe layer, in every figure folder.

    python3 scripts/avatar/crumbs.py [--dry]

A component of a layer that is not connected to the piece and is under 2% of
its largest part is a fragment the Kontext cut left behind: a dyed spot on
the shin (shorts, vest), a scrap over the fingers (tunic, apron,
breastplate), a shadow puddle beside the shoe (capes, skirts, long hair).
wardrobe-audit.py's CRUMB check is this same rule, so after this runs it
reports none. Pieces MADE of separate parts are skipped (same list).
"""
import importlib.util, json, os, sys
import numpy as np
from PIL import Image
from scipy.ndimage import label

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('wa', os.path.join(HERE, 'wardrobe-audit.py'))
wa = importlib.util.module_from_spec(spec)
_argv, sys.argv = sys.argv, ['wardrobe-audit.py']
spec.loader.exec_module(wa)
sys.argv = _argv
DRY = '--dry' in sys.argv
AV = wa.R

for folder in ('masc', 'fem', 'masc_slim', 'masc_sturdy', 'fem_slim', 'fem_sturdy'):
    for lid in sorted(wa.D[folder]):
        base = lid.split('__')[0]
        if wa.D['items'].get(base, {}).get('slot') not in wa.SLOTS or base in wa.MANY_PARTS:
            continue
        p = f'{AV}{folder}/{lid}.webp'
        a = np.array(Image.open(p).convert('RGBA'))
        lb, n = label(a[..., 3] > 40)
        if n < 2:
            continue
        sizes = np.bincount(lb.ravel())[1:]
        small = np.isin(lb, np.where(sizes < sizes.max() * 0.02)[0] + 1)
        # take the faint halo round each crumb too
        from scipy.ndimage import binary_dilation
        small = binary_dilation(small, iterations=2) & ~np.isin(lb, np.where(sizes >= sizes.max() * 0.02)[0] + 1)
        k = int((small & (a[..., 3] > 0)).sum())
        if k < 15:
            continue
        print(f'{folder}/{lid}: {k} px')
        if not DRY:
            a[small] = 0
            Image.fromarray(a).save(p, 'WEBP', quality=88, method=6)
