#!/usr/bin/env python3
"""Clear green-suit leaks and stray footwear from FULL-COLOUR clothing layers.

    python3 scripts/avatar/green-leak.py --only top_magi_robe,top_fleece_mantle [--dry]
    python3 scripts/avatar/layers.py builds --only <same ids>

layers.py drops the green undersuit by hue (g > r+35 and g > b+35), but
Kontext re-shades the suit where a garment overlaps it: an open robe's front
and the sleeves under a fleece come back olive or dark green, under that
threshold, and get drawn as a green stripe over every player (Advent 2026).
For a full-colour piece that is NOT green itself, any green-dominant pixel is
suit, so it is cleared.

Never run it on a green garment, and never on a tinted (grey) one: those keep
their hue elsewhere and cloth-skin.py owns them. Hence --only is required.

HEM also cuts a long top at its own hem, per figure, where the edit painted
sandals or boots under it (a top that carries shoes draws them over whatever
shoes the player chose). Rows are on the 360x728 canvas, measured off the layer
(last row of the garment's own colour, plus its trim).
"""
import json, os, sys
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
AV = os.path.join(ROOT, 'public', 'avatar')
DRY = '--dry' in sys.argv
if '--only' not in sys.argv:
    raise SystemExit('--only id,id is required: see the header')
ONLY = set(sys.argv[sys.argv.index('--only') + 1].split(','))
HEM = {('masc', 'top_magi_robe'): 620}
OLIVE = {('masc', 'top_magi_robe')}


def main():
    idx = json.load(open(os.path.join(AV, 'index.json')))
    for fig in ('masc', 'fem'):
        for lid in sorted(ONLY):
            box = idx[fig].get(lid)
            if not box or idx['items'].get(lid, {}).get('tint'):
                continue
            path = os.path.join(AV, fig, lid + '.webp')
            a = np.asarray(Image.open(path).convert('RGBA')).astype(int)
            r, g, b = a[..., 0], a[..., 1], a[..., 2]
            m = (g > r + 10) & (g > b + 10) & (a[..., 3] > 0)
            if (fig, lid) in OLIVE:
                # the re-shaded suit down an open front reads olive (r ~ g), which
                # gold trim never does (gold is r > g + 20)
                m |= (g >= r - 6) & (g > b + 20) & (a[..., 3] > 0)
            hem = HEM.get((fig, lid))
            if hem is not None:
                m[max(0, hem - box['y']):] |= a[max(0, hem - box['y']):, :, 3] > 0
            n = int(m.sum())
            print(f'{fig}/{lid}: {n} px', flush=True)
            if DRY or not n:
                continue
            a[m, 3] = 0
            im = Image.fromarray(a.clip(0, 255).astype(np.uint8), 'RGBA')
            bb = im.getbbox()
            im.crop(bb).save(path, 'WEBP', quality=88, method=6)
            idx[fig][lid] = {'x': box['x'] + bb[0], 'y': box['y'] + bb[1], 'w': bb[2] - bb[0], 'h': bb[3] - bb[1]}
    if not DRY:
        json.dump(idx, open(os.path.join(AV, 'index.json'), 'w', newline='\n'), indent=1, sort_keys=True)
        sys.path.insert(0, os.path.dirname(__file__))
        import importlib.util
        spec = importlib.util.spec_from_file_location('layers', os.path.join(os.path.dirname(__file__), 'layers.py'))
        layers = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(layers)
        layers.write_ts(idx)


if __name__ == '__main__':
    main()
