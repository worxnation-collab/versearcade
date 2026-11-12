#!/usr/bin/env python3
"""Every wardrobe piece, worn, on a skin tone — composited the way
LayeredFigure.tsx draws it (draw order, the luma x colour x 1.6 tint, the
`<id>__skin` layer in the player's tone).

    python3 scripts/avatar/outfits.py <out.png> <slots> <tone> [build]
    e.g. outfits.py /tmp/tops.png top ebony
         outfits.py /tmp/legs.png legs,belt,shoes porcelain sturdy

audit.py shows each layer ALONE; this shows it WORN, over the body and the
starter outfit, which is where a cream sleeve, a pale fist or a leaked face
actually shows. Run it on ebony and porcelain before calling art done.
"""
import json, sys, numpy as np
from PIL import Image, ImageDraw
import os
R = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'avatar') + '/'
D = json.load(open(R + 'index.json'))
ORDER = ['back', 'body', 'legs', 'shoes', 'top', 'belt', 'hair', 'head', 'held']
TONES = {'ebony': '#5A3A24', 'amber': '#C68A5E', 'porcelain': '#F0C9A8'}
def hexrgb(h): return np.array([int(h[i:i+2], 16) for i in (1, 3, 5)], np.float32) / 255
def layer(key, lid, color):
    box = D[key].get(lid)
    if not box: return None
    a = np.asarray(Image.open(f'{R}{key}/{lid}.webp').convert('RGBA'), np.float32) / 255
    if color is not None:
        luma = a[..., :3] @ np.array([.299, .587, .114])
        a[..., :3] = np.clip(luma[..., None] * hexrgb(color) * 1.6, 0, 1)
    return a, box
def render(fig, build, tone, outfit):
    key = fig if build == 'standard' else f'{fig}_{build}'
    def k(lid): return key if lid in D[key] else fig
    c = np.zeros((728, 360, 3), np.float32) + np.array([.24, .26, .3])
    for slot in ORDER:
        ids = []
        if slot == 'body':
            b = f'body_{tone}' if f'body_{tone}' in D[fig] else 'body'
            ids = [(b, None)]
        elif slot in outfit:
            lid, col = outfit[slot]
            tint = D['items'].get(lid, {}).get('tint')
            ids = [(lid, col if tint else None), (lid + '__skin', TONES[tone])]
        for lid, col in ids:
            r = layer(k(lid), lid, col)
            if r is None: continue
            a, box = r
            x, y = box['x'], box['y']; h, w = a.shape[:2]
            y0, x0 = max(0, y), max(0, x); y1, x1 = min(728, y + h), min(360, x + w)
            sub = a[y0 - y:y1 - y, x0 - x:x1 - x]
            al = sub[..., 3:4]
            c[y0:y1, x0:x1] = c[y0:y1, x0:x1] * (1 - al) + sub[..., :3] * al
    return Image.fromarray((c * 255).astype(np.uint8))
BASE = {'hair': ('hair_short', '#2A1B12'), 'top': ('top_tshirt', '#4F8FD6'), 'legs': ('legs_jeans', '#2A3F7A'), 'shoes': ('shoes_sneakers', '#F2ECE0')}
if __name__ == '__main__':
    out, slots, tone = sys.argv[1], sys.argv[2].split(','), sys.argv[3]
    build = sys.argv[4] if len(sys.argv) > 4 else 'standard'
    tiles = []
    for fig in ('fem', 'masc'):
        for lid in sorted(k for k in D[fig] if D['items'].get(k, {}).get('slot') in slots):
            o = dict(BASE); o[D['items'][lid]['slot']] = (lid, '#9a6a3a')
            im = render(fig, build, tone, o).crop((30, 60, 330, 700)).resize((120, 256))
            ImageDraw.Draw(im).text((2, 2), f'{fig[0]} {lid.split("_", 1)[1][:14]}', fill=(255, 255, 0))
            tiles.append(im)
    cols = 14
    rows = (len(tiles) + cols - 1) // cols
    c = Image.new('RGB', (cols * 120, rows * 256))
    for i, t in enumerate(tiles):
        c.paste(t, ((i % cols) * 120, (i // cols) * 256))
    c.save(out)
    print(len(tiles), 'pieces ->', out)
