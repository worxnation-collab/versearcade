#!/usr/bin/env python3
"""The wardrobe, WORN, checked by machine — so a leak is caught here and not
on the owner's phone (2026-11-13: three rounds of "it still renders wrong").

    python3 scripts/avatar/wardrobe-audit.py [--sheet out_dir] [--write-baseline]

Every piece, on both figures and all three builds, is composited over the
dark (ebony) body exactly as LayeredFigure draws it, with any tinted piece
dyed a BLUE no skin has. Then, per piece:

  LEAK    pixels the piece put ON the body's silhouette that are skin-hued
          and much lighter than ebony skin. Every bug of the last three
          passes was this: the light base's forehead, face, cuff, chest or
          shins carried inside a layer. Tinted pieces are blue here, so a
          light skin-hued pixel from one can only be a leak; untinted pieces
          (gold, wood, straw) are judged against a stricter bar.
  CRUMB   bits of the piece not connected to its body and under 2% of it —
          cheek tabs, ear slivers, stray sleeves. Pieces made of separate
          parts (stars, flowers, wreath leaves) are exempt.
  EDGE    a piece whose bottom or side runs along a perfectly straight
          horizontal cut through the face (the brow-line cut, left hard).

Exit 1 on any finding over threshold; the report says which piece, which
figure and build, and how many pixels, worst first. --sheet writes a worn
contact sheet per slot for a person to LOOK at as well.
"""
import importlib.util, json, os, sys
import numpy as np
from PIL import Image
from scipy.ndimage import label, binary_dilation

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('o', os.path.join(HERE, 'outfits.py'))
o = importlib.util.module_from_spec(spec)
_argv, sys.argv = sys.argv, ['outfits.py']
spec.loader.exec_module(o)
sys.argv = _argv

D, R = o.D, o.R
BLUE = '#3A6AD0'
SLOTS = ('top', 'legs', 'shoes', 'belt', 'head', 'held', 'back', 'hair')
MANY_PARTS = {'head_crown_stars', 'head_flower_crown', 'head_laurel', 'head_olive_wreath',
              'head_star_circlet', 'head_halo', 'head_goggles', 'back_star_wings', 'back_wings',
              'back_golden_wings', 'held_fishing_net', 'held_bread_basket', 'held_harp',
              'shoes_winged', 'top_star_robe', 'belt_star_sash', 'legs_starry'}
LEAK_MAX = 60      # pixels of light skin a piece may put on the body
CRUMB_MAX = 40     # pixels of disconnected crumbs
BASE = {'hair': ('hair_buzz', '#1E1410'), 'top': ('top_tshirt', '#202020'),
        'legs': ('legs_jeans', '#202020'), 'shoes': ('shoes_sneakers', '#202020')}


def hsv(rgb):
    mx, mn = rgb.max(-1), rgb.min(-1)
    d = np.maximum(mx - mn, 1e-3)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    hue = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    return hue, (mx - mn) / np.maximum(mx, 1e-3), mx


def layer_alpha(key, lid):
    box = D[key].get(lid)
    if not box:
        return None
    a = np.asarray(Image.open(f'{R}{key}/{lid}.webp').convert('RGBA'))[..., 3] > 40
    c = np.zeros((728, 360), bool)
    x, y = box['x'], box['y']
    y0, x0 = max(0, y), max(0, x)
    y1, x1 = min(728, y + a.shape[0]), min(360, x + a.shape[1])
    if y1 > y0 and x1 > x0:
        c[y0:y1, x0:x1] = a[y0 - y:y1 - y, x0 - x:x1 - x]
    return c


def layer_rgba(key, lid):
    box = D[key][lid]
    a = np.asarray(Image.open(f'{R}{key}/{lid}.webp').convert('RGBA'), np.float32)
    c = np.zeros((728, 360, 4), np.float32)
    x, y = box['x'], box['y']
    y0, x0, y1, x1 = max(0, y), max(0, x), min(728, y + a.shape[0]), min(360, x + a.shape[1])
    c[y0:y1, x0:x1] = a[y0 - y:y1 - y, x0 - x:x1 - x]
    return c


def lab(rgb):
    rgb = rgb / 255.0
    lin = np.where(rgb > 0.04045, ((rgb + 0.055) / 1.055) ** 2.4, rgb / 12.92)
    M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = lin @ M.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def _base(fig):
    im = np.asarray(Image.open(os.path.join(HERE, '..', '..', 'art', 'avatar', 'bases', fig + '.png')).convert('RGB').resize((360, 728), Image.LANCZOS), np.float32)
    mag = (im[..., 0] > 180) & (im[..., 2] > 180) & (im[..., 1] < 110)
    return {'lab': lab(im), 'a': np.where(mag, 0, 255)}


BASES = {f: _base(f) for f in ('masc', 'fem')}


def body_mask(fig, build):
    key = fig if build == 'standard' else f'{fig}_{build}'
    lid = 'body_ebony' if 'body_ebony' in D[key] else 'body'
    return layer_alpha(key if lid in D[key] else fig, lid)


def audit(fig, build, lid, slot):
    key = fig if build == 'standard' else f'{fig}_{build}'
    k = key if lid in D[key] else fig
    tinted = bool(D['items'].get(lid, {}).get('tint'))
    outfit = dict(BASE)
    if slot in ('head',):
        outfit['hair'] = ('hair_buzz', '#1E1410')
    outfit[slot] = (lid, BLUE)
    img = np.asarray(o.render(fig, build, 'ebony', outfit), np.float32) / 255
    mine = layer_alpha(k, lid)
    if mine is None:
        return None
    # LEAK: peach (the light base's skin) that the piece put on the body.
    # Tinted pieces are dyed BLUE here, so any peach from one is a leak,
    # wherever it is. Untinted ones (gold, wood, straw, parchment) are warm
    # by nature, so they are only judged on the FACE, where a crown or helm
    # has no business being peach — that is where every untinted leak so far
    # (the brim forehead, the helm's cheek rim) has been.
    skin_layer = layer_alpha(k, lid + '__skin')
    body = binary_dilation(body_mask(fig, build), iterations=2)
    hue, sat, val = hsv(img)
    luma = img @ np.array([.299, .587, .114])
    peach = (hue >= 10) & (hue <= 36) & (sat > 0.32) & (sat < 0.85) & (luma > 0.50)
    zone = body.copy()
    if not tinted:
        zone[215:] = False
    on = mine & zone & peach
    if skin_layer is not None:
        on &= ~skin_layer
    leak = int(on.sum()) if (tinted or slot in ('head', 'hair')) else 0
    crumbs, cm = 0, np.zeros_like(mine)
    if lid not in MANY_PARTS:
        lb, n = label(mine)
        if n > 1:
            sizes = np.bincount(lb.ravel())[1:]
            small = np.where(sizes < sizes.max() * 0.02)[0] + 1
            cm = np.isin(lb, small)
            crumbs = int(cm.sum())
    marked = img.copy()
    marked[on] = (1, 0, 0)
    marked[cm] = (1, 0, 1)
    return leak, crumbs, img, marked


def main():
    sheet = sys.argv[sys.argv.index('--sheet') + 1] if '--sheet' in sys.argv else None
    findings, tiles = [], {}
    for fig in ('masc', 'fem'):
        for build in ('standard', 'slim', 'sturdy'):
            for lid in sorted(k for k in D[fig] if D['items'].get(k, {}).get('slot') in SLOTS):
                slot = D['items'][lid]['slot']
                r = audit(fig, build, lid, slot)
                if r is None:
                    continue
                leak, crumbs, img, marked = r
                if leak > LEAK_MAX:
                    findings.append((leak, f'LEAK  {fig}/{build} {lid}: {leak} px of light skin on the body'))
                if crumbs > CRUMB_MAX:
                    findings.append((crumbs, f'CRUMB {fig}/{build} {lid}: {crumbs} px in loose bits'))
                if sheet and build == 'standard' and (leak > LEAK_MAX or crumbs > CRUMB_MAX):
                    # a zoomed crop around what was flagged, beside the same crop unmarked
                    ys, xs = np.where((marked != img).any(-1))
                    if len(ys):
                        cy, cx = int(np.median(ys)), int(np.median(xs))
                        box = (max(0, cx - 50), max(0, cy - 50), min(360, cx + 50), min(728, cy + 50))
                        pair = Image.new('RGB', (400, 220), (20, 20, 20))
                        pair.paste(Image.fromarray((img * 255).astype(np.uint8)).crop(box).resize((200, 200)), (0, 20))
                        pair.paste(Image.fromarray((marked * 255).astype(np.uint8)).crop(box).resize((200, 200)), (200, 20))
                        from PIL import ImageDraw
                        ImageDraw.Draw(pair).text((4, 4), f'{fig} {lid} L{leak} C{crumbs}', fill=(255, 255, 0))
                        tiles.setdefault('flagged', []).append(pair)
                if sheet and build == 'standard':
                    tiles.setdefault(slot, []).append(Image.fromarray((img * 255).astype(np.uint8)).crop((30, 20, 330, 720)).resize((150, 350)))
    if sheet:
        os.makedirs(sheet, exist_ok=True)
        for slot, ts in tiles.items():
            tw, th = ts[0].size
            cols = max(1, 1600 // tw)
            c = Image.new('RGB', (cols * tw, ((len(ts) + cols - 1) // cols) * th))
            for i, t in enumerate(ts):
                c.paste(t, ((i % cols) * tw, (i // cols) * th))
            c.save(os.path.join(sheet, f'worn_{slot}.png'))
    findings.sort(reverse=True)
    # The BASELINE: what a person looked at and accepted (a crown's red gems,
    # a straw brim's underside read as peach). A finding fails only when it
    # is NEW or has grown past what was accepted — so a re-extraction that
    # brings a leak back fails here, not on a phone.
    bpath = os.path.join(HERE, 'wardrobe-audit.baseline.json')
    keyed = {line.split(':')[0]: n for n, line in findings}
    if '--write-baseline' in sys.argv:
        json.dump(keyed, open(bpath, 'w'), indent=1, sort_keys=True)
        print(f'baseline written: {len(keyed)} accepted finding(s)')
        return
    base = json.load(open(bpath)) if os.path.exists(bpath) else {}
    bad = [(n, line) for n, line in findings if n > base.get(line.split(':')[0], 0) * 1.2 + 30]
    for _, line in bad:
        print(line)
    print(f'wardrobe-audit: {len(findings)} finding(s), {len(findings) - len(bad)} accepted in the baseline, {len(bad)} new or worse')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
