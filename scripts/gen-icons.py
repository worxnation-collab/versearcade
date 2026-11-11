#!/usr/bin/env python3
"""Paint the app's icon set as ONE hand (art/icons.flux.json).

    python3 scripts/gen-icons.py [--only id,id] [--force] [--dry]   # --dry: previews only

The master is drawn from text with Flux Pro; every other icon is a Flux Kontext
EDIT of the master ("replace the object with ..."), so the set shares one
light, palette, scale and framing instead of 48 separate prompts drifting.
Keyed off magenta, trimmed, padded square and written at 132px to every path
in `out`. Raw renders cache in art/icons/.raw (gitignored). The fal.ai key is a
network secret injected by the environment's proxy; nothing here reads one.
"""
import base64, io, json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'avatar'))
import numpy as np
from PIL import Image
from layers import kontext, _get, H, A, not_magenta, despill, clean  # same fal.ai client
import urllib.request, time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
M = json.load(open(os.path.join(ROOT, 'art', 'icons.flux.json')))
RAW = os.path.join(ROOT, 'art', 'icons', '.raw')
PREV = os.path.join(ROOT, 'art', 'icons', 'preview')
os.makedirs(RAW, exist_ok=True); os.makedirs(PREV, exist_ok=True)
SIZE, PAD = 132, 0.06


def text_to_image(prompt):
    body = {"prompt": prompt, "image_size": "square_hd", "output_format": "png", "num_images": 1}
    req = urllib.request.Request("https://queue.fal.run/fal-ai/flux-pro/v1.1", data=json.dumps(body).encode(), headers=H)
    r = json.load(urllib.request.urlopen(req, timeout=60))
    for _ in range(150):
        if _get(r["status_url"])["status"] == "COMPLETED":
            break
        time.sleep(2)
    url = _get(r["response_url"])["images"][0]["url"]
    return Image.open(io.BytesIO(urllib.request.urlopen(url, timeout=60).read())).convert("RGB")


def cutout(im):
    """Background removal by model (fal-ai/birefnet/v2), not a colour key:
    Flux paints the "flat magenta" as a textured raspberry with the object's
    glow bleeding into it, which no fixed key survives. Cached beside the raw."""
    buf = io.BytesIO(); im.save(buf, 'PNG')
    body = {"image_url": "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()}
    req = urllib.request.Request("https://queue.fal.run/fal-ai/birefnet/v2", data=json.dumps(body).encode(), headers=H)
    r = json.load(urllib.request.urlopen(req, timeout=60))
    for _ in range(90):
        if _get(r["status_url"])["status"] == "COMPLETED":
            break
        time.sleep(2)
    url = _get(r["response_url"])["image"]["url"]
    return Image.open(io.BytesIO(urllib.request.urlopen(url, timeout=60).read())).convert("RGBA")


def key(raw_path):
    cut_path = raw_path.replace('.png', '.cut.png')
    if not os.path.exists(cut_path) or os.path.getmtime(cut_path) < os.path.getmtime(raw_path):
        cutout(Image.open(raw_path).convert('RGB')).save(cut_path)
    out = Image.open(cut_path).convert('RGBA')
    a = np.asarray(out).copy()
    a[..., 3] = np.where(a[..., 3] < 24, 0, a[..., 3])     # drop the faint halo
    out = Image.fromarray(a, 'RGBA')
    box = out.getbbox()
    out = out.crop(box)
    side = int(max(out.size) * (1 + 2 * PAD))
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sq.paste(out, ((side - out.width) // 2, (side - out.height) // 2), out)
    return sq.resize((SIZE, SIZE), Image.LANCZOS)


def write(ico, it, dry):
    ico.save(os.path.join(PREV, it['id'] + '.png'))
    if not dry:
        for p in it['out']:
            ico.save(os.path.join(ROOT, p))


def main():
    args = sys.argv[1:]
    only = set(args[args.index('--only') + 1].split(',')) if '--only' in args else None
    force, dry = '--force' in args, '--dry' in args
    mp = os.path.join(RAW, 'master.png')
    if force and (not only or M['master']['id'] in only) or not os.path.exists(mp):
        text_to_image(M['style'].replace('one object', 'one object: ' + M['master']['subject'])).save(mp)
        print('master drawn', flush=True)
    master = Image.open(mp).convert('RGB')
    write(key(mp), M['master'], dry)
    from concurrent.futures import ThreadPoolExecutor
    todo = [it for it in M['icons'] if (not only or it['id'] in only)]

    def one(it):
        p = os.path.join(RAW, it['id'] + '.png')
        if force or not os.path.exists(p):
            prompt = (f"Replace the object with {it['subject']}. Keep EXACTLY the same painting style, burnished gold "
                      "palette, soft top-left light, scale and centring, and the same solid flat magenta background. "
                      "Only that one object: no text, no frame, no tile, no plate, no ground shadow.")
            kontext(prompt, master).save(p)
        write(key(p), it, dry)
        return it['id']

    with ThreadPoolExecutor(4) as ex:
        for r in ex.map(one, todo):
            print('ok', r, flush=True)


if __name__ == '__main__':
    main()
