#!/usr/bin/env python3
"""Paint the arcade's in-game backdrops (art/arcade-scenes.flux.json).

    python3 scripts/gen-arcade-scenes.py [--only id,id]

Flux Pro Ultra, the covers' hand, written as JPEGs over public/arcade/<id>.jpg
at the size each field already draws them, so GENERATED_ART needs no change.
The fal.ai key is a network secret injected by the environment's proxy.
"""
import io, json, os, sys, time, urllib.request
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'avatar'))
from PIL import Image
from layers import _get, H

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
M = json.load(open(os.path.join(ROOT, 'art', 'arcade-scenes.flux.json')))


def paint(prompt, aspect):
    body = {"prompt": prompt, "aspect_ratio": aspect, "output_format": "jpeg", "num_images": 1, "safety_tolerance": "2"}
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
    for sid, s in M["scenes"].items():
        if only and sid not in only:
            continue
        im = paint(s["subject"] + '. ' + M["style"], s["aspect"])
        w, h = s["size"]
        # Cover-crop to the field's exact box (Flux's 2:3 is not exactly 429x640).
        r = max(w / im.width, h / im.height)
        im = im.resize((round(im.width * r), round(im.height * r)), Image.LANCZOS)
        l, t = (im.width - w) // 2, (im.height - h) // 2
        if s.get('anchor') == 'bottom':
            t = im.height - h
        im = im.crop((l, t, l + w, t + h))
        out = os.path.join(ROOT, 'public', 'arcade', f'{sid}.jpg')
        im.save(out, 'JPEG', quality=84, optimize=True, progressive=True)
        print('ok', sid, os.path.getsize(out) // 1024, 'KB', flush=True)


if __name__ == '__main__':
    main()
