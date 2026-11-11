#!/usr/bin/env python3
"""Layered avatar wardrobe: generate and extract every item in art/avatar/items.json.

    python3 scripts/avatar/layers.py gen      [--only id,id] [--fig masc|fem] [--force]
    python3 scripts/avatar/layers.py extract  [--only id,id] [--fig masc|fem]
    python3 scripts/avatar/layers.py sheet    # contact sheets into art/avatar/.raw/

How a layer is made (docs/AVATAR-LAYERS.md):
  1. Flux Kontext (fal.ai) edits the figure's BASE body: "add ONLY this hat".
     Clothing (top/legs/shoes/belt) edits the GREEN-SUIT copy instead, because a
     grey garment over a grey suit is invisible to the subtraction below.
  2. The edit is subtracted from that base pixel by pixel. What changed is the
     item, already registered on the shared canvas: no manual alignment.
  3. tint:true items are drawn grey and coloured at runtime by multiplying their
     luminance (one render, any colour).

Raw edits are cached in art/avatar/.raw (gitignored, ~1MB each): delete one to
re-roll it. Layers land in public/avatar/<fig>/<id>.webp, trimmed to their
bounding box at half resolution, with the box in public/avatar/index.json.

The fal.ai key is a network secret injected by the environment's proxy for
queue.fal.run; nothing here reads a key.
"""
import json, os, sys, time, io, base64, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as nd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ART = os.path.join(ROOT, 'art', 'avatar')
RAW = os.path.join(ART, '.raw')
OUT = os.path.join(ROOT, 'public', 'avatar')
FIGS = ['masc', 'fem']
GREEN_SLOTS = {'top', 'legs', 'shoes', 'belt'}
SCALE = 0.5   # 720x1456 render -> 360x728 canvas

KEEP = ("Keep EVERYTHING else exactly identical: same character, same pose, same face, same body, "
        "same size and position in frame, same lighting, same painted storybook style, same solid "
        "magenta background. Do not move, resize or redraw the character or the face. ")
GREY = (" The item is rendered in neutral mid-grey tones only with no colour, keeping all shading "
        "and folds, so it can be recoloured later.")
GREEN = " The green undersuit stays exactly the same bright green wherever it is not covered."

H = {"Authorization": "Key proxy-injected", "Content-Type": "application/json"}


def _get(url):
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=H), timeout=60))


def kontext(prompt, image):
    buf = io.BytesIO(); image.save(buf, 'PNG')
    body = {"prompt": prompt, "output_format": "png",
            "image_url": "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()}
    for attempt in range(5):
        try:
            req = urllib.request.Request("https://queue.fal.run/fal-ai/flux-pro/kontext",
                                         data=json.dumps(body).encode(), headers=H)
            r = json.load(urllib.request.urlopen(req, timeout=60))
            for _ in range(150):
                if _get(r["status_url"])["status"] == "COMPLETED":
                    break
                time.sleep(2)
            url = _get(r["response_url"])["images"][0]["url"]
            return Image.open(io.BytesIO(urllib.request.urlopen(url, timeout=60).read())).convert("RGB")
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors='ignore')[:200]
            if 'Exhausted balance' in msg:
                raise SystemExit('fal.ai balance exhausted: ' + msg)
            time.sleep(4 * (attempt + 1))
        except Exception:
            time.sleep(4 * (attempt + 1))
    raise RuntimeError('kontext failed 5 times')


def items(only=None):
    data = json.load(open(os.path.join(ART, 'items.json')))
    its = data['items']
    return [i for i in its if not only or i['id'] in only]


def base(fig, green=False):
    return Image.open(os.path.join(ART, 'bases', f"{fig}{'_green' if green else ''}.png")).convert('RGB')


def prompt_for(it):
    p = KEEP + "Add ONLY " + it['prompt'] + "."
    if it['slot'] in GREEN_SLOTS:
        p += GREEN
    if it.get('tint'):
        p += GREY
    return p


def gen(only, figs, force):
    jobs = [(f, it) for f in figs for it in items(only)
            if force or not os.path.exists(os.path.join(RAW, f, it['id'] + '.png'))]
    print(f'{len(jobs)} renders to make', flush=True)

    def one(job):
        f, it = job
        os.makedirs(os.path.join(RAW, f), exist_ok=True)
        try:
            im = kontext(prompt_for(it), base(f, it['slot'] in GREEN_SLOTS))
            im.save(os.path.join(RAW, f, it['id'] + '.png'))
            return f'ok   {f}/{it["id"]}'
        except SystemExit:
            raise
        except Exception as e:
            return f'FAIL {f}/{it["id"]} {e}'

    with ThreadPoolExecutor(4) as ex:
        for i, r in enumerate(ex.map(one, jobs), 1):
            print(f'[{i}/{len(jobs)}] {r}', flush=True)


# ---------- extraction ----------

def A(im):
    return np.asarray(im).astype(int)


def not_magenta(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return ~((r > 170) & (b > 170) & (g < 120))


def despill(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    s = (r - g > 40) & (b - g > 40)
    rgb[..., 0] = np.where(s, np.minimum(r, g + 25), r)
    rgb[..., 2] = np.where(s, np.minimum(b, g + 25), b)
    return rgb


def clean(m, minpx=600):
    m = nd.binary_opening(m, iterations=2)
    m = nd.binary_closing(m, iterations=3)
    m = nd.binary_fill_holes(m)
    lab, n = nd.label(m)
    if n:
        sizes = nd.sum(m, lab, range(1, n + 1))
        m = np.isin(lab, 1 + np.where(sizes > minpx)[0])
    return m


def save_layer(rgb, m, fig, name, index):
    m = nd.binary_erosion(m, iterations=1)
    alpha = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.0)))
    im = Image.fromarray(np.dstack([despill(rgb.copy()), alpha]).astype(np.uint8), 'RGBA')
    w, h = im.size
    im = im.resize((int(w * SCALE), int(h * SCALE)), Image.LANCZOS)
    box = im.getbbox()
    if not box:
        index[fig].pop(name, None)
        return 0
    im = im.crop(box)
    os.makedirs(os.path.join(OUT, fig), exist_ok=True)
    im.save(os.path.join(OUT, fig, name + '.webp'), 'WEBP', quality=88, method=6)
    index[fig][name] = {'x': box[0], 'y': box[1], 'w': box[2] - box[0], 'h': box[3] - box[1]}
    return int(m.sum())


def extract(only, figs):
    ipath = os.path.join(OUT, 'index.json')
    index = json.load(open(ipath)) if os.path.exists(ipath) else {}
    index['canvas'] = {'w': int(720 * SCALE), 'h': int(1456 * SCALE)}
    meta = {it['id']: it for it in items()}
    report = []
    for f in figs:
        index.setdefault(f, {})
        b, g = A(base(f)), A(base(f, True))
        save_layer(b, clean(not_magenta(b), 50), f, 'body', index)
        for it in items(only):
            p = os.path.join(RAW, f, it['id'] + '.png')
            if not os.path.exists(p):
                continue
            e = A(Image.open(p).convert('RGB'))
            if e.shape != b.shape:
                report.append(f'{f}/{it["id"]}: size {e.shape} != base, re-roll'); continue
            if it['slot'] in GREEN_SLOTS:
                r_, g_, b_ = e[..., 0], e[..., 1], e[..., 2]
                green = (g_ > 130) & (r_ < 110) & (b_ < 110)
                m = (np.abs(e - g).sum(-1) > 45) & not_magenta(e) & ~green
            else:
                m = (np.abs(e - b).sum(-1) > 45) & not_magenta(e)
            px = save_layer(e, clean(m), f, it['id'], index)
            if px < 1500:
                report.append(f'{f}/{it["id"]}: only {px}px changed, re-roll')
    index['items'] = {i: {'slot': m['slot'], 'tint': m.get('tint', False)} for i, m in meta.items()}
    json.dump(index, open(ipath, 'w'), indent=1, sort_keys=True)
    print('\n'.join(report) or 'all layers extracted')


def sheet():
    """One contact sheet per figure: every layer composited on the body."""
    index = json.load(open(os.path.join(OUT, 'index.json')))
    W, Hh = index['canvas']['w'], index['canvas']['h']
    for f in FIGS:
        if f not in index:
            continue
        ids = [i for i in index[f] if i != 'body']
        cols = 10; tw, th = 150, int(150 * Hh / W)
        rows = (len(ids) + cols - 1) // cols
        s = Image.new('RGB', (cols * tw, rows * (th + 14)), (40, 32, 28))
        body = Image.open(os.path.join(OUT, f, 'body.webp')).convert('RGBA')
        bb = index[f]['body']
        from PIL import ImageDraw
        d = ImageDraw.Draw(s)
        for k, i in enumerate(ids):
            c = Image.new('RGBA', (W, Hh), (60, 52, 48, 255))
            c.alpha_composite(body, (bb['x'], bb['y']))
            box = index[f][i]
            c.alpha_composite(Image.open(os.path.join(OUT, f, i + '.webp')).convert('RGBA'), (box['x'], box['y']))
            x, y = (k % cols) * tw, (k // cols) * (th + 14)
            s.paste(c.convert('RGB').resize((tw, th)), (x, y))
            d.text((x + 2, y + th), i[:24], fill=(255, 255, 255))
        s.save(os.path.join(RAW, f'sheet_{f}.png'))
        print('sheet', f, len(ids))


if __name__ == '__main__':
    args = sys.argv[1:]
    cmd = args[0] if args else 'gen'
    only = None
    figs = FIGS
    if '--only' in args:
        only = set(args[args.index('--only') + 1].split(','))
    if '--fig' in args:
        figs = [args[args.index('--fig') + 1]]
    if cmd == 'gen':
        gen(only, figs, '--force' in args)
    elif cmd == 'extract':
        extract(only, figs)
    elif cmd == 'sheet':
        sheet()
