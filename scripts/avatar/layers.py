#!/usr/bin/env python3
"""Layered avatar wardrobe: generate and extract every item in art/avatar/items.json.

    python3 scripts/avatar/layers.py gen      [--only id,id] [--fig masc|fem] [--force]
    python3 scripts/avatar/layers.py extract  [--only id,id] [--fig masc|fem]
    python3 scripts/avatar/layers.py builds   # slim + sturdy from the extracted layers
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
queue.fal.run on the cloud environment; on a desk machine it is read from the
FAL_KEY environment variable. No file holds it.
"""
import json, os, sys, time, io, base64, urllib.request, urllib.error
NL = '\n'   # generated files keep LF on Windows too
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
# Rows on the 1456-tall render, measured off both bases: the chin sits near
# 400 and the shoulders near 470.
HEAD_LINE = 400
SHOULDER_LINE = 470
# Where each clothing slot may live, top and bottom rows on the 1456 render
# (measured off both bases: waist ~650, knee ~1000, ankle ~1350, soles ~1440).
# The model often adds something extra to an edit (sandals under a hoodie,
# a repainted suit under sandals); a band keeps each layer to its own job.
BANDS = {'top': (380, 1345), 'legs': (600, 1375), 'shoes': (960, 1456), 'belt': (600, 900)}

KEEP = ("Keep EVERYTHING else exactly identical: same character, same pose, same face, same body, "
        "same size and position in frame, same lighting, same painted storybook style, same solid "
        "magenta background. Do not move, resize or redraw the character or the face. ")
GREY = (" The item is rendered in neutral mid-grey tones only with no colour, keeping all shading "
        "and folds, so it can be recoloured later.")
GREEN = " The green undersuit stays exactly the same bright green wherever it is not covered."

# On the cloud environment the proxy injects the key for queue.fal.run. On a
# desk machine it comes from FAL_KEY in the environment. Never commit a key.
H = {"Authorization": "Key " + os.environ.get("FAL_KEY", "proxy-injected"), "Content-Type": "application/json"}


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
    data = json.load(open(os.path.join(ART, 'items.json'), encoding='utf-8'))
    its = data['items']
    return [i for i in its if not only or i['id'] in only]


def base(fig, green=False):
    return Image.open(os.path.join(ART, 'bases', f"{fig}{'_green' if green else ''}.png")).convert('RGB')


ARMS = (" THE ARMS DO NOT MOVE: both arms and hands stay exactly where they are in the reference, "
        "hanging at the sides; do not draw any new arm or hand.")


def prompt_for(it):
    p = KEEP + "Add ONLY " + it['prompt'] + "."
    if it['slot'] == 'held':
        p += ARMS
    if it['slot'] in GREEN_SLOTS:
        p += GREEN
    if it.get('tint'):
        p += GREY
    return p


def gen(only, figs, force):
    jobs = [(f, it) for f in figs for it in items(only) if not (it.get('shared') and f != 'masc')
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


def despill(rgb, green=False):
    """Pull magenta (backdrop) and green (suit) fringes out of edge pixels."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    s = (r - g > 40) & (b - g > 40)
    rgb[..., 0] = np.where(s, np.minimum(r, g + 25), r)
    rgb[..., 2] = np.where(s, np.minimum(b, g + 25), b)
    if green:
        gs = (g - r > 25) & (g - b > 25)
        rgb[..., 1] = np.where(gs, np.maximum(r, b) + 10, g)
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


def save_layer(rgb, m, fig, name, index, green=False):
    m = nd.binary_erosion(m, iterations=1)
    alpha = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.0)))
    im = Image.fromarray(np.dstack([despill(rgb.copy(), green), alpha]).astype(np.uint8), 'RGBA')
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


# The base bodies are painted in 'sand' (data/avatar SKINS). Every other tone
# is the same body re-skinned, so the six tones of the starter picker carry
# over to the layered character.
TONES = {
    'porcelain': 'a fair, light peach',
    'amber': 'a warm golden medium tan',
    'bronze': 'a medium brown',
    'umber': 'a deep brown',
    'ebony': 'a very dark brown',
}


def tones(figs, force):
    jobs = [(f, t) for f in figs for t in TONES
            if force or not os.path.exists(os.path.join(RAW, f, f'body_{t}.png'))]
    print(f'{len(jobs)} tones to make', flush=True)

    def one(job):
        f, t = job
        os.makedirs(os.path.join(RAW, f), exist_ok=True)
        p = (KEEP + f"Change ONLY the skin colour of the face, ears, neck, arms, hands and feet to {TONES[t]} "
             "skin tone. The undersuit, the bald head shape, the face shape and features stay exactly the same.")
        kontext(p, base(f)).save(os.path.join(RAW, f, f'body_{t}.png'))
        return f'ok   {f}/body_{t}'

    with ThreadPoolExecutor(4) as ex:
        for r in ex.map(one, jobs):
            print(r, flush=True)


# ---------- builds ----------
# Slim and sturdy are the SAME art reshaped, not new renders. Kontext was tried
# first (2026-11-11) and could not hold the head still: it resized the face,
# turned "sturdy" into a bodybuilder or a belly, and a moved head would have
# broken every hair and hat. A horizontal stretch about the figure's centre
# line, faded in from the chin to the shoulders, leaves the head pixel for pixel
# where it was (so hair and hats still fit) and moves every garment with the
# body it was cut from (so they stay registered for free). Held items are
# MOVED with the hand rather than stretched, so a sword stays a sword.
BUILDS = {'slim': 0.86, 'sturdy': 1.2}
WARP_TOP, WARP_FULL = 200, 240   # canvas rows: the chin, and the shoulders
PAD = 70                          # canvas columns a stretched layer may spill


def warp_layer(im, box, k, cx):
    W, Hh = int(720 * SCALE), int(1456 * SCALE)
    c = np.zeros((Hh, W + 2 * PAD, 4))
    a = np.asarray(im.convert('RGBA')).astype(float)
    c[box['y']:box['y'] + box['h'], PAD + box['x']:PAD + box['x'] + box['w']] = a
    y = np.arange(Hh)[:, None]; x = np.arange(W + 2 * PAD)[None, :]
    t = np.clip((y - WARP_TOP) / (WARP_FULL - WARP_TOP), 0, 1); t = t * t * (3 - 2 * t)
    sx = (cx + PAD) + (x - (cx + PAD)) / (1 + (k - 1) * t)
    yy, xx = np.broadcast_to(y, sx.shape), sx
    # Premultiply so an edge never drags transparent black into the colour.
    pm = c.copy(); pm[..., :3] *= c[..., 3:] / 255
    o = np.stack([nd.map_coordinates(pm[..., i], [yy, xx], order=1, mode='constant') for i in range(4)], -1)
    al = o[..., 3:]
    o[..., :3] = np.where(al > 0, o[..., :3] * 255 / np.maximum(al, 1e-6), 0)
    return Image.fromarray(o.clip(0, 255).astype(np.uint8), 'RGBA')


def builds(figs=FIGS, only=None):
    ipath = os.path.join(OUT, 'index.json')
    index = json.load(open(ipath))
    meta = index['items']
    for f in figs:
        bb = index[f]['body']
        cx = bb['x'] + bb['w'] / 2
        for b, k in BUILDS.items():
            key = f'{f}_{b}'
            # --only re-derives just those pieces (and their __skin layers),
            # leaving every other slim/sturdy file byte for byte as it was.
            if only is None:
                index[key] = {}
            else:
                index.setdefault(key, {})
            os.makedirs(os.path.join(OUT, key), exist_ok=True)
            for name, box in index[f].items():
                if only is not None and name.split('__')[0] not in only:
                    continue
                # a `<id>__skin` layer (skin-split.py) moves with its item
                slot = meta.get(name.split('__')[0], {}).get('slot')
                if slot == 'pet':
                    continue   # a pet stands beside the figure, whatever its build
                src = Image.open(os.path.join(OUT, f, name + '.webp'))
                if slot == 'held':
                    # Follow the hand: the item's centre moves as the body's
                    # columns do at full stretch.
                    mid = box['x'] + box['w'] / 2
                    nb = dict(box, x=int(round(box['x'] + (mid - cx) * (k - 1))))
                    src.save(os.path.join(OUT, key, name + '.webp'), 'WEBP', quality=88, method=6)
                    index[key][name] = nb
                    continue
                out = warp_layer(src, box, k, cx)
                bx = out.getbbox()
                if not bx:
                    continue
                out.crop(bx).save(os.path.join(OUT, key, name + '.webp'), 'WEBP', quality=88, method=6)
                index[key][name] = {'x': bx[0] - PAD, 'y': bx[1], 'w': bx[2] - bx[0], 'h': bx[3] - bx[1]}
            print(key, len(index[key]), flush=True)
    json.dump(index, open(ipath, 'w', newline=NL), indent=1, sort_keys=True)
    write_ts(index)


def write_ts(index):
    """src/data/avatarLayers.ts: the index as a module, so the app imports it
    rather than fetching it. Generated; do not hand-edit."""
    out = os.path.join(ROOT, 'src', 'data', 'avatarLayers.ts')
    figs = {f: index[f] for f in index if f.split('_')[0] in FIGS}
    with open(out, 'w', newline=NL) as fh:
        fh.write('// GENERATED by scripts/avatar/layers.py extract. Do not hand-edit.\n')
        fh.write('// Each box is where a layer sits on the shared canvas; see docs/AVATAR-LAYERS.md.\n\n')
        fh.write('export interface LayerBox { x: number; y: number; w: number; h: number }\n')
        fh.write("export interface LayerMeta { slot: string; tint: boolean; starter: boolean }\n\n")
        fh.write(f"export const LAYER_CANVAS = {json.dumps(index['canvas'])} as const\n\n")
        fh.write('export const LAYER_BOXES: Record<string, Record<string, LayerBox>> = ')
        fh.write(json.dumps(figs, indent=1, sort_keys=True) + '\n\n')
        fh.write('export const LAYER_ITEMS: Record<string, LayerMeta> = ')
        fh.write(json.dumps(index['items'], indent=1, sort_keys=True) + '\n')


def extract(only, figs):
    ipath = os.path.join(OUT, 'index.json')
    index = json.load(open(ipath)) if os.path.exists(ipath) else {}
    index['canvas'] = {'w': int(720 * SCALE), 'h': int(1456 * SCALE)}
    meta = {it['id']: it for it in items()}
    report = []
    for f in figs:
        index.setdefault(f, {})
        b0, g = A(base(f)), A(base(f, True))
        # --only re-cuts the named pieces and nothing else. The body layers
        # were repainted after extraction (body-skin.py), so re-saving them
        # from the base here would quietly undo that.
        if only is None:
            save_layer(b0, clean(not_magenta(b0), 50), f, 'body', index)
        for t in (TONES if only is None else ()):
            tp = os.path.join(RAW, f, f'body_{t}.png')
            if os.path.exists(tp):
                bt = A(Image.open(tp).convert('RGB'))
                save_layer(bt, clean(not_magenta(bt), 50), f, f'body_{t}', index)
        for it in items(only):
            # A shared item (a pet beside the figure) is rendered once, on masc.
            p = os.path.join(RAW, 'masc' if it.get('shared') else f, it['id'] + '.png')
            b = A(base('masc')) if it.get('shared') else A(base(f))
            if not os.path.exists(p):
                continue
            e = A(Image.open(p).convert('RGB'))
            if e.shape != b.shape:
                report.append(f'{f}/{it["id"]}: size {e.shape} != base, re-roll'); continue
            if it['slot'] in GREEN_SLOTS:
                # Green by HUE, not by value: Kontext often re-shades the
                # uncovered suit (lime, mint, dark green), and a fixed RGB box
                # let those through as part of the garment.
                r_, g_, b_ = e[..., 0], e[..., 1], e[..., 2]
                green = (g_ > r_ + 35) & (g_ > b_ + 35)
                m = (np.abs(e - g).sum(-1) > 45) & not_magenta(e) & ~green
                # The body's own skin (hands, feet, neck) is not the garment,
                # even where the model relit it: a hoodie layer that keeps the
                # hands gets them tinted red and drawn over the shoes.
                gr, gg, gb = g[..., 0], g[..., 1], g[..., 2]
                base_skin = not_magenta(g) & ~((gg > gr + 35) & (gg > gb + 35))
                # Sandals are straps ON the skin, so shoes keep anything that
                # moved more than a relight would.
                near = 50 if it['slot'] == 'shoes' else 110
                m &= ~(base_skin & (np.abs(e - g).sum(-1) < near))
                # An item may narrow its slot's band (ankle shoes stop at the ankle).
                lo, hi = it.get('band') or BANDS[it['slot']]
                m[:lo] = False
                m[hi:] = False
                # Clothing never owns the face: a hood the model added anyway
                # would otherwise carry its own redrawn face into the layer.
                m[:HEAD_LINE] &= False
            else:
                m = (np.abs(e - b).sum(-1) > 45) & not_magenta(e)
                if it['slot'] == 'head':
                    # A glowing halo relights the whole body; a hat lives above
                    # the shoulders, so nothing below them is the hat.
                    m[SHOULDER_LINE:] = False
            m = clean(m)
            # A new arm: skin-coloured pixels in the layer where the base had
            # only backdrop. That arm would be drawn beside the body's own one.
            r_, g_, b_ = e[..., 0], e[..., 1], e[..., 2]
            # Skin is bright and warm with real blue in it; wood is darker and gold
            # and brass have almost no blue, so neither reads as an arm.
            skin = (r_ > 200) & (g_ > 130) & (g_ < 205) & (b_ > 90) & (b_ < 175) & (r_ - g_ > 25) & (r_ - g_ < 95)
            extra = int((m & skin & ~not_magenta(b)).sum())
            if it['slot'] == 'held' and extra > 400:
                report.append(f'{f}/{it["id"]}: draws a second arm ({extra}px), re-roll')
            px = save_layer(e, m, f, it['id'], index, it['slot'] in GREEN_SLOTS)
            if px < 1500:
                report.append(f'{f}/{it["id"]}: only {px}px changed, re-roll')
    index['items'] = {i: {'slot': m['slot'], 'tint': m.get('tint', False), 'starter': m.get('starter', False)} for i, m in meta.items()}
    json.dump(index, open(ipath, 'w', newline=NL), indent=1, sort_keys=True)
    write_ts(index)
    print('\n'.join(report) or 'all layers extracted')


def sheet():
    """One contact sheet per figure: every layer composited on the body."""
    index = json.load(open(os.path.join(OUT, 'index.json')))
    W, Hh = index['canvas']['w'], index['canvas']['h']
    for f in FIGS:
        if f not in index:
            continue
        ids = [i for i in index[f] if not i.startswith('body')]
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
    elif cmd == 'tones':
        tones(figs, '--force' in args)
    elif cmd == 'builds':
        builds(figs, only)
    elif cmd == 'sheet':
        sheet()
