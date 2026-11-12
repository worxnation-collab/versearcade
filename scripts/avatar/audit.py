#!/usr/bin/env python3
"""Contact sheets of every wardrobe layer ON the darkest and lightest tone.

    python3 scripts/avatar/audit.py            # -> art/avatar/.audit/<fig>_<slot>.png

Run it after ANY layer change (a new item, extract, builds, a fix script) and
LOOK at it. Every bug of the 2026-11-12 cleanup was visible here at a glance and
invisible in code: light skin baked into hats and clothes (a pale band on the
ebony row), a coat with trousers in it (legs covered), a whole bald head in the
halo. Each cell is the piece alone over the bare body, ebony on top and
porcelain below, so a leak shows as a patch that matches the WRONG row.
"""
import json, os
from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
AV = os.path.join(ROOT, 'public', 'avatar')
IDX = json.load(open(os.path.join(AV, 'index.json')))
OUT = os.path.join(ROOT, 'art', 'avatar', '.audit'); os.makedirs(OUT, exist_ok=True)
W, H = IDX['canvas']['w'], IDX['canvas']['h']
CELL = 150


def put(c, fig, lid):
    b = IDX[fig][lid]
    c.alpha_composite(Image.open(os.path.join(AV, fig, lid + '.webp')).convert('RGBA'), (b['x'], b['y']))


for fig in ('masc', 'fem'):
    for slot in ('head', 'hair', 'top', 'legs', 'shoes', 'belt', 'held', 'back'):
        ids = sorted(k for k, v in IDX['items'].items() if v['slot'] == slot and k in IDX[fig])
        if not ids:
            continue
        cols = min(10, len(ids)); rows = (len(ids) + cols - 1) // cols
        sheet = Image.new('RGB', (cols * CELL, rows * (CELL + 16)), (60, 50, 60))
        d = ImageDraw.Draw(sheet)
        for n, lid in enumerate(ids):
            x, y = (n % cols) * CELL, (n // cols) * (CELL + 16)
            for k, tone in enumerate(('body_ebony', 'body_porcelain')):
                c = Image.new('RGBA', (W, H), (60, 50, 60, 255))
                if slot == 'back':
                    put(c, fig, lid); put(c, fig, tone)
                else:
                    put(c, fig, tone); put(c, fig, lid)
                c.thumbnail((CELL, CELL * 2))
                sheet.paste(c.crop((0, 0, CELL, CELL)) if False else c.resize((CELL // 2, CELL)), (x + k * CELL // 2, y))
            d.text((x + 3, y + CELL + 2), lid.split('_', 1)[1][:22], fill=(230, 220, 230))
        p = os.path.join(OUT, f'{fig}_{slot}.png'); sheet.save(p); print(p)
