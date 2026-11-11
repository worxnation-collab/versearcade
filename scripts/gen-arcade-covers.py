#!/usr/bin/env python3
"""Paint the arcade's cover paintings (art/arcade-covers.flux.json).

    python3 scripts/gen-arcade-covers.py [--only id,id] [--force]

Flux Pro Ultra at 3:4, written as 600x800 JPEGs to public/arcade/cover_<id>.jpg.
Same hand as the card backgrounds. The fal.ai key is a network secret injected
by the environment's proxy; nothing here reads one.
"""
import io, json, os, sys, time, urllib.request
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'avatar'))
from PIL import Image
from layers import _get, H

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
M = json.load(open(os.path.join(ROOT, 'art', 'arcade-covers.flux.json')))


def paint(prompt):
    body = {"prompt": prompt, "aspect_ratio": "3:4", "output_format": "jpeg", "num_images": 1, "safety_tolerance": "2"}
    req = urllib.request.Request("https://queue.fal.run/" + M["model"], data=json.dumps(body).encode(), headers=H)
    r = json.load(urllib.request.urlopen(req, timeout=60))
    for _ in range(150):
        if _get(r["status_url"])["status"] == "COMPLETED":
            break
        time.sleep(2)
    url = _get(r["response_url"])["images"][0]["url"]
    return Image.open(io.BytesIO(urllib.request.urlopen(url, timeout=60).read())).convert("RGB")


def main():
    args = sys.argv[1:]
    only = args[args.index('--only') + 1].split(',') if '--only' in args else None
    for cid, subject in M["covers"].items():
        if only and cid not in only:
            continue
        out = os.path.join(ROOT, 'public', 'arcade', f'cover_{cid}.jpg')
        if os.path.exists(out) and '--force' not in args:
            continue
        im = paint(subject + '. ' + M["style"]).resize((600, 800), Image.LANCZOS)
        im.save(out, 'JPEG', quality=84, optimize=True, progressive=True)
        print('ok', cid, os.path.getsize(out) // 1024, 'KB')


if __name__ == '__main__':
    main()
