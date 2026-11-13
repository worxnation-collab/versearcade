#!/usr/bin/env python3
"""A picture of each BACK piece on its own, for the wardrobe's tiles.

    python3 scripts/avatar/back-icons.py [--only id,id] [--force]

A back layer is painted only where it shows around the body (it was cut from
behind it), so alone in a tile it is a body-shaped hole with two straps, and on
the figure seen from the front a backpack, a satchel and a skateboard all read
as the same bit of strap. So each one gets an item picture: Flux Pro from text,
the object alone in three-quarter view, cut out by birefnet (gen-icons.py's
pipeline), 160px tall, at public/avatar/icons/<id>.webp. A tinted piece is drawn
light grey so the tile's runtime tint colours it as the figure does.
"""
import importlib, json, os, sys
sys.path.insert(0, os.path.dirname(__file__)); sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import numpy as np
from PIL import Image
icons = importlib.import_module('gen-icons')

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ITEMS = json.load(open(os.path.join(ROOT, 'art', 'avatar', 'items.json'), encoding='utf-8'))
ITEMS = ITEMS['items'] if isinstance(ITEMS, dict) else ITEMS
RAW = os.path.join(ROOT, 'art', 'avatar', '.raw', 'icons'); os.makedirs(RAW, exist_ok=True)
OUT = os.path.join(ROOT, 'public', 'avatar', 'icons'); os.makedirs(OUT, exist_ok=True)
STYLE = ("A single game inventory item picture of {what}. The object ALONE, nobody wearing it, seen in a gentle "
         "three-quarter view from slightly behind so its back is visible, whole object in frame and centred. Soft "
         "painted 3D storybook game art, gentle top-left light, clean readable silhouette. {tone} Solid flat magenta "
         "(#FF00FF) background, no shadow, no text.")


OVERRIDE = {
    'back_banner': 'a tall wooden pole carrying a small white banner with a gold cross, the pole on its own with no ground',
    'back_lantern_pack': 'a wooden backpack frame with a large glowing brass lantern hanging from its top corner',
}


def what(it):
    if it['id'] in OVERRIDE:
        return OVERRIDE[it['id']]
    p = it['prompt']
    for cut in (' worn on', ' on a strap across the body', ' hanging from the shoulders', ' spreading out from behind',
                ' carried BEHIND', ' slung', ' strapped flat against the back', ' on the back', ' carried on the back',
                ' rising from behind the back'):
        p = p.split(cut)[0]
    return p


def main():
    a = sys.argv[1:]
    only = set(a[a.index('--only') + 1].split(',')) if '--only' in a else None
    force = '--force' in a
    todo = [it for it in ITEMS if it['id'].startswith('back_') and (not only or it['id'] in only)]

    def one(it):
        rp = os.path.join(RAW, it['id'] + '.png')
        if force or not os.path.exists(rp):
            tone = 'Plain light grey material, no colour.' if it.get('tint') else 'Its own natural colours.'
            icons.text_to_image(STYLE.format(what=what(it), tone=tone)).save(rp)
        cp = rp.replace('.png', '.cut.png')
        if force or not os.path.exists(cp):
            icons.cutout(Image.open(rp).convert('RGB')).save(cp)
        im = Image.open(cp).convert('RGBA')
        arr = np.asarray(im).copy(); arr[..., 3] = np.where(arr[..., 3] < 24, 0, arr[..., 3])
        im = Image.fromarray(arr, 'RGBA'); im = im.crop(im.getbbox())
        im.thumbnail((160, 160), Image.LANCZOS)
        im.save(os.path.join(OUT, it['id'] + '.webp'), 'WEBP', quality=88, method=6)
        return it['id']

    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(5) as ex:
        for i in ex.map(one, todo):
            print('ok', i, flush=True)


if __name__ == '__main__':
    main()
