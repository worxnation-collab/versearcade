#!/usr/bin/env python3
"""Repaint the churchyard as ONE calm hand (art/churchyard.flux.json).

    python3 scripts/gen-churchyard.py scenes|flora|statues|ladder [--only id,id] [--force] [--dry]

Scenes: Flux Pro Ultra, written over public/church/scene_*.jpg at 1168x784.
Flora and statues: a master drawn from text, every other one a Flux Kontext
EDIT of its master (one light, palette and scale), cut out by birefnet,
trimmed and written at the height the owner's set used (300 / 360px).
Ladder: 8 tiers x 4 skins of church building, tier 1 from text and every
later tier a Kontext edit of the one below it, at public/church/buildings/
<skin>-<tier>.png (then resized to 320px and quantized; see the PR).
Files land on the SAME paths ownerArt.ts / sceneArt.ts already read, so no
code changes. --dry writes previews to art/churchyard/preview only.
The fal.ai key is a network secret injected by the environment's proxy.
"""
import io, json, os, sys, time, urllib.request
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'avatar'))
sys.path.insert(0, os.path.dirname(__file__))
import numpy as np
from PIL import Image
from layers import kontext, _get, H
import importlib
icons = importlib.import_module('gen-icons')  # text_to_image + cutout (birefnet)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
M = json.load(open(os.path.join(ROOT, 'art', 'churchyard.flux.json')))
RAW = os.path.join(ROOT, 'art', 'churchyard', '.raw')
PREV = os.path.join(ROOT, 'art', 'churchyard', 'preview')
os.makedirs(RAW, exist_ok=True); os.makedirs(PREV, exist_ok=True)

FLORA_OUT = {
    'yard_planters': 'planters', 'yard_ivy': 'ivy', 'yard_marigolds': 'marigolds',
    'yard_lavender': 'lavender', 'yard_lilies': 'lilies', 'yard_olive': 'olive',
    'yard_rosebush': 'roses', 'yard_bench': 'bench', 'yard_hedge': 'hedge',
    'yard_birdbath': 'birdbath', 'yard_lamp': 'lamp', 'yard_wisteria': 'wisteria',
    'yard_sunflowers': 'sunflowers', 'yard_dogwood': 'dogwood',
}
STATUE_OUT = {
    'statue_shepherd': 'good-shepherd', 'statue_mary': 'virgin-mary', 'statue_moses': 'moses',
    'statue_angel': 'guardian-angel', 'statue_david': 'david', 'statue_dove': 'descending-dove',
    'statue_tomb': 'empty-tomb', 'statue_lion_lamb': 'lion-and-lamb',
    'statue_praying': 'praying-figure', 'statue_cross': 'stone-cross',
}


def ultra(prompt, aspect):
    body = {"prompt": prompt, "aspect_ratio": aspect, "output_format": "jpeg", "num_images": 1, "safety_tolerance": "2"}
    req = urllib.request.Request("https://queue.fal.run/" + M["scene_model"], data=json.dumps(body).encode(), headers=H)
    r = json.load(urllib.request.urlopen(req, timeout=60))
    for _ in range(150):
        if _get(r["status_url"])["status"] == "COMPLETED":
            break
        time.sleep(2)
    url = _get(r["response_url"])["images"][0]["url"]
    return Image.open(io.BytesIO(urllib.request.urlopen(url, timeout=60).read())).convert("RGB")


def cut(raw_path, height):
    """birefnet cutout, faint halo dropped, trimmed to the object, scaled to `height`."""
    cp = raw_path.replace('.png', '.cut.png')
    if not os.path.exists(cp) or os.path.getmtime(cp) < os.path.getmtime(raw_path):
        icons.cutout(Image.open(raw_path).convert('RGB')).save(cp)
    im = Image.open(cp).convert('RGBA')
    a = np.asarray(im).copy()
    a[..., 3] = np.where(a[..., 3] < 24, 0, a[..., 3])
    im = Image.fromarray(a, 'RGBA')
    im = im.crop(im.getbbox())
    w = max(1, round(im.width * height / im.height))
    return im.resize((w, height), Image.LANCZOS)


def put(img, rel, dry, key):
    img.save(os.path.join(PREV, key + ('.jpg' if rel.endswith('.jpg') else '.png')))
    if dry:
        return
    p = os.path.join(ROOT, rel)
    if rel.endswith('.jpg'):
        img.save(p, 'JPEG', quality=84, optimize=True, progressive=True)
    else:
        img.save(p, optimize=True)


def scenes(only, force, dry):
    """Painted from text in the buildings' hand (icons.text_to_image, square),
    horizon asked for at the middle, then cropped so it lands ~62% down."""
    from concurrent.futures import ThreadPoolExecutor

    def one(sid):
        rp = os.path.join(RAW, sid + '.text.png')
        if force or not os.path.exists(rp):
            icons.text_to_image(M['scenes'][sid] + '. ' + M['scene_text_style']).save(rp)
        im = Image.open(rp).convert('RGB')
        S = im.width
        h = round(S * 784 / 1168)
        top = max(0, min(S - h, round(0.5 * S - 0.62 * h)))
        im = im.crop((0, top, S, top + h)).resize((1168, 784), Image.LANCZOS)
        put(im, f'public/church/{sid}.jpg', dry, sid)
        return sid

    todo = [s for s in M['scenes'] if not only or s in only]
    with ThreadPoolExecutor(5) as ex:
        for sid in ex.map(one, todo):
            print('ok', sid, flush=True)


def props(kind, only, force, dry):
    master = M[kind + '_master']
    table = M[kind if kind == 'flora' else 'statues']
    outmap = FLORA_OUT if kind == 'flora' else STATUE_OUT
    height = 300 if kind == 'flora' else 360
    folder = 'public/keep/churchyard' + ('' if kind == 'flora' else '/statues')
    style = M['prop_style'] + (' ' + M['statue_style_note'] if kind == 'statue' else '')
    mp = os.path.join(RAW, master['id'] + '.png')
    if (force and (not only or master['id'] in only)) or not os.path.exists(mp):
        icons.text_to_image(style.replace('ONE object', 'ONE object: ' + master['subject'])).save(mp)
    if not only or master['id'] in only:
        put(cut(mp, height), f"{folder}/{outmap[master['id']]}.png", dry, master['id'])
        print('ok', master['id'], flush=True)
    base = Image.open(mp).convert('RGB')
    todo = [(k, v) for k, v in table.items() if not only or k in only]

    def one(kv):
        k, sub = kv
        p = os.path.join(RAW, k + '.png')
        if force or not os.path.exists(p):
            kontext(f"Replace the object with {sub}. Keep EXACTLY the same soft painted gouache style, muted warm "
                    "palette, gentle top-left light, front-on eye-level view, scale and centring, and the same "
                    "solid flat magenta background. Only that one object, upright and whole: no ivy, no vines, no "
                    "gold, no ornament, no soil, rocks, grass or ground under it, no shadow, no text.", base).save(p)
        put(cut(p, height), f'{folder}/{outmap[k]}.png', dry, k)
        return k

    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(4) as ex:
        for k in ex.map(one, todo):
            print('ok', k, flush=True)


TIERS = ['gathering', 'chapel', 'country', 'parish', 'stone', 'great', 'cathedral', 'basilica']


def ladder(only, force, dry):
    """Each skin's eight tiers, every tier an edit of the one below it."""
    from concurrent.futures import ThreadPoolExecutor
    mat, form = M['skins_material'], M['tiers_form']

    def skin(sk):
        prev = None
        fm = M.get('tiers_form_' + sk, form)
        for t in TIERS:
            key = f'{sk}-{t}'
            p = os.path.join(RAW, key + '.png')
            want = not only or sk in only or key in only
            if want and (force or not os.path.exists(p)):
                if prev is None:
                    icons.text_to_image(M['ladder_style'].replace('ONE church building', f"ONE church building: {fm[t]}, in {mat[sk]}")).save(p)
                else:
                    kontext(f"Grow this church into the next, larger stage: {fm[t]}. Keep EXACTLY the same materials "
                            f"({mat[sk]}), the same soft painted gouache style, warm top-left light, front three-quarter view "
                            "and the same solid flat magenta background. The building alone: no ground, grass, shrubs, path, "
                            "people or shadow, no text.", prev).save(p)
            if os.path.exists(p):
                put(cut(p, 440), f'public/church/buildings/{key}.png', dry, key)
                prev = Image.open(p).convert('RGB')
                print('ok', key, flush=True)
        return sk

    with ThreadPoolExecutor(4) as ex:
        list(ex.map(skin, ['tile', 'classic', 'modern', 'glass']))


def main():
    a = sys.argv[1:]
    what = a[0]
    only = set(a[a.index('--only') + 1].split(',')) if '--only' in a else None
    force, dry = '--force' in a, '--dry' in a
    if what == 'scenes':
        scenes(only, force, dry)
    elif what in ('flora', 'statue', 'statues'):
        props('flora' if what == 'flora' else 'statue', only, force, dry)
    elif what == 'ladder':
        ladder(only, force, dry)


if __name__ == '__main__':
    main()
