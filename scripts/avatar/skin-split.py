#!/usr/bin/env python3
"""Split the LIGHT BASE'S SKIN out of wardrobe layers into a skin layer the
renderer colours to the player's own tone.

    python3 scripts/avatar/skin-split.py --sheet   # review: skin found, in magenta
    python3 scripts/avatar/skin-split.py           # write <id>.webp + <id>__skin.webp
    python3 scripts/avatar/layers.py builds        # then the slim/sturdy copies

Every piece was cut from a Kontext edit of the light base body, so a hand on a
staff, a bare forearm under a mantle, toes in a sandal came out as the BASE'S
light skin — a pale hand on an ebony player. Removing those pixels leaves a
staff floating beside a fist; keeping them is the bug. So they MOVE: out of
the item, into `<id>__skin.webp` as grey luminance normalised so the
renderer's tint filter (LayeredFigure, the same one a garment colour uses)
paints them in skinHex(spec.skin). A hand then matches the body for every tone
that exists and every one added later.

Skin is found by COLOUR DISTANCE to the base body's own skin, measured off
art/avatar/bases (Lab, Mahalanobis), and only near the body's outline —
gold, parchment, bread and tan leather sit close to skin in hue, which is why
a hue test alone ate the cream cap. Pieces whose material IS skin-coloured are
listed in KEEP and never split. Head layers are head-face.py's job.
"""
import json, os, sys
import numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation, binary_opening, label

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
AV = os.path.join(ROOT, 'public', 'avatar')
IDX_PATH = os.path.join(AV, 'index.json')
IDX = json.load(open(IDX_PATH))
W, H = IDX['canvas']['w'], IDX['canvas']['h']
SLOTS = ('held', 'back', 'top', 'legs', 'shoes', 'belt')
# Materials that ARE skin-coloured (tan felt, straw, bread, light wood,
# parchment, gold): judged by eye on the --sheet, never split.
KEEP = set()
# The pieces that really carry the base's skin, reviewed on --sheet
# (2026-11-12), and where on the body it is. Everything else the colour test
# flags is the material itself: honey wood, gold, parchment, cream fur.
SPLIT = {
    'back_elijah_mantle': 'hands', 'back_lion_cape': 'hands', 'back_banner': 'hands',
    'belt_rope': 'hands', 'belt_nomad_sash': 'hands',
    'held_crook': 'grip_high', 'held_staff': 'grip', 'held_star_staff': 'grip', 'held_torch': 'grip',
    'held_fishing_net': 'grip',
    'top_breastplate': 'hands', 'top_light_robe': 'hands', 'top_many_colors': 'hands',
    'top_nomad_robe': 'hands', 'top_royal_robe': 'hands', 'top_star_robe': 'hands',
    'top_work_apron': 'hands', 'top_dress': 'hands', 'top_armor_full': 'hands',
    'shoes_sandals': 'feet', 'shoes_gold_sandals': 'feet', 'shoes_peace': 'feet',
}
THRESH = 3.2      # Mahalanobis distance in Lab
MIN_BLOB = 18     # px; specks are noise, not a hand


def lab(rgb):
    rgb = rgb / 255.0
    lin = np.where(rgb > 0.04045, ((rgb + 0.055) / 1.055) ** 2.4, rgb / 12.92)
    M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = lin @ M.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


_M = {}


def model(fig):
    """Mean + inverse covariance of the base body's skin in Lab, and its mask."""
    if fig not in _M:
        im = Image.open(os.path.join(ROOT, 'art', 'avatar', 'bases', fig + '.png')).convert('RGB').resize((W, H), Image.LANCZOS)
        a = np.asarray(im, np.float32)
        r, g, b = a[..., 0], a[..., 1], a[..., 2]
        mag = (r > 180) & (b > 180) & (g < 110)
        L = lab(a)
        # The base wears a CREAM BODYSUIT: its only skin is the head, the
        # forearms and hands, and the feet. Learn from those alone, or every
        # cream garment reads as skin.
        zone = np.zeros((H, W), bool)
        zone[:205] = True                       # head and neck
        zone[365:480, :125] = True              # left forearm + hand
        zone[365:480, 235:] = True              # right forearm + hand
        zone[615:] = True                       # feet in sandals
        sk = ~mag & zone & (r > g) & (g > b) & (L[..., 0] > 35) & ((r - b) > 45)
        px = L[sk]
        mu = px.mean(0)
        cov = np.cov(px.T) + np.eye(3) * 2
        z = {}
        hands = sk.copy(); hands[:330] = False; hands[600:] = False
        z['hands'] = binary_dilation(hands, iterations=18)
        z['grip'] = np.zeros((H, W), bool); z['grip'][290:520] = True   # the fist moves, but stays at hand height (a flame or a star above it is not skin)
        z['grip_high'] = np.zeros((H, W), bool); z['grip_high'][200:520] = True   # the crook is held high too
        feet = sk.copy(); feet[:600] = False
        z['feet'] = binary_dilation(feet, iterations=14)
        z['any'] = binary_dilation(sk, iterations=30)
        _M[fig] = (mu, np.linalg.inv(cov), ~mag, z)
    return _M[fig]


def canvas(folder, lid):
    box = IDX[folder][lid]
    im = Image.open(os.path.join(AV, folder, lid + '.webp')).convert('RGBA')
    c = np.zeros((H, W, 4), np.float32)
    x, y = box['x'], box['y']
    a = np.asarray(im, np.float32)
    h, w = a.shape[:2]
    c[y:y + h, x:x + w] = a[:max(0, min(h, H - y)), :max(0, min(w, W - x))]
    return c, box


def find(folder, lid):
    mu, ic, body, zones = model(folder.split('_')[0])
    lay, box = canvas(folder, lid)
    L = lab(lay[..., :3])
    d = L - mu
    dist = np.sqrt(np.einsum('...i,ij,...j->...', d, ic, d))
    near = zones[SPLIT.get(lid, 'any')]
    # skin is L~70 a~20 b~40 on both bases: pale wood is darker (L 40-50) and
    # cream cloth has no red in it (a~2), so both are held out explicitly
    warm = (L[..., 0] > 55) & (L[..., 1] > 11) & (L[..., 2] > 26)
    if SPLIT.get(lid, '').startswith('grip'):
        # a fist on a pole is small and lit: seed with a looser test, or the
        # hand on the torch and the crook is never found at all
        warm = (L[..., 0] > 52) & (L[..., 1] > 8) & (L[..., 2] > 18)
        m = (dist < THRESH * 1.5) & (lay[..., 3] > 40) & near & warm
    else:
        m = (dist < THRESH) & (lay[..., 3] > 40) & near & warm
    m = binary_opening(m, iterations=1)
    lab_, n = label(m)
    if n:
        sizes = np.bincount(lab_.ravel())
        keep = sizes >= MIN_BLOB
        keep[0] = False
        m = keep[lab_]
    # grow each found patch into its paler highlights (a knuckle catching
    # the light), never into dark wood or cool cloth
    loose = near & (lay[..., 3] > 40) & (L[..., 0] > 50) & (L[..., 1] > 4) & (L[..., 2] > 9) & (dist < THRESH * 3)
    for _ in range(6):
        m = m | (binary_dilation(m) & loose)
    # take the soft edge with it, so no light rim is left round the hand
    edge = binary_dilation(m, iterations=1) & ~m & (lay[..., 3] > 0) & (dist < THRESH * 1.8) & (L[..., 1] > 7) & (L[..., 0] > 45)
    m = m | edge
    # the base's cream BODYSUIT sleeve, cut with the fist: erased, not tinted
    cuff = np.zeros_like(m)
    if SPLIT.get(lid, '').startswith('grip'):
        cuff = binary_dilation(m, iterations=7) & ~m & (lay[..., 3] > 0) & (L[..., 0] > 68) \
            & (np.abs(L[..., 1]) < 9) & (L[..., 2] < 24)
    return lay, box, m, cuff


def sheet(out):
    tiles = []
    for folder in ('fem', 'masc'):
        _, _, body, _ = model(folder)
        for lid in sorted(IDX[folder]):
            slot = IDX['items'].get(lid, {}).get('slot')
            if slot not in SLOTS or (ONLY and lid not in SPLIT):
                continue
            lay, box, m, cuff = find(folder, lid)
            n = int(m.sum())
            if n < MIN_BLOB:
                continue
            bg = np.zeros((H, W, 3), np.float32) + (60, 66, 76)
            bg[body] = (90, 58, 36)
            a = lay[..., 3:4] / 255
            bg = bg * (1 - a) + lay[..., :3] * a
            bg[m] = (255, 0, 255)
            bg[cuff] = (0, 255, 255)
            ys, xs = np.where(lay[..., 3] > 20)
            y0, y1 = max(0, ys.min() - 8), min(H, ys.max() + 8)
            x0, x1 = max(0, xs.min() - 8), min(W, xs.max() + 8)
            t = Image.fromarray(bg[y0:y1, x0:x1].astype(np.uint8))
            t.thumbnail((170, 220))
            tile = Image.new('RGB', (175, 240), (20, 20, 24))
            tile.paste(t, (2, 18))
            from PIL import ImageDraw
            ImageDraw.Draw(tile).text((2, 2), f'{folder[0]} {lid} {n}', fill=(255, 255, 0))
            tiles.append(tile)
    cols = 10
    rows = (len(tiles) + cols - 1) // cols
    c = Image.new('RGB', (cols * 175, rows * 240))
    for i, t in enumerate(tiles):
        c.paste(t, ((i % cols) * 175, (i // cols) * 240))
    c.save(out)
    print(len(tiles), 'layers with skin ->', out)


def write():
    changed = 0
    for folder in ('fem', 'masc'):
        for lid in sorted(list(IDX[folder])):
            slot = IDX['items'].get(lid, {}).get('slot')
            if slot not in SLOTS or lid in KEEP or lid not in SPLIT:
                continue
            lay, box, m, cuff = find(folder, lid)
            if m.sum() < MIN_BLOB:
                continue
            # the skin: grey luminance, normalised so the tint filter's gain
            # (1.6) lands the mean on the player's tone
            rgb = lay[..., :3] / 255
            lum = rgb @ np.array([0.299, 0.587, 0.114])
            mean = float(lum[m].mean())
            g = np.clip(lum * (0.62 / max(mean, 1e-3)), 0, 1) * 255
            sk = np.zeros((H, W, 4), np.float32)
            sk[..., 0] = sk[..., 1] = sk[..., 2] = g
            sk[..., 3] = np.where(m, lay[..., 3], 0)
            item = lay.copy()
            item[m | cuff, 3] = 0
            ys, xs = np.where(sk[..., 3] > 0)
            bx = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
            Image.fromarray(sk.astype(np.uint8), 'RGBA').crop(bx).save(
                os.path.join(AV, folder, lid + '__skin.webp'), 'WEBP', quality=90, method=6)
            IDX[folder][lid + '__skin'] = {'x': bx[0], 'y': bx[1], 'w': bx[2] - bx[0], 'h': bx[3] - bx[1]}
            x, y, w, h = box['x'], box['y'], box['w'], box['h']
            Image.fromarray(item[y:y + h, x:x + w].clip(0, 255).astype(np.uint8), 'RGBA').save(
                os.path.join(AV, folder, lid + '.webp'), 'WEBP', quality=88, method=6)
            changed += 1
            print(f'{folder}/{lid}: {int(m.sum())} px of skin', flush=True)
    json.dump(IDX, open(IDX_PATH, 'w'), indent=1, sort_keys=True)
    print(changed, 'layers split')


ONLY = '--all' not in sys.argv

if __name__ == '__main__':
    if '--sheet' in sys.argv:
        sheet(sys.argv[sys.argv.index('--sheet') + 1] if len(sys.argv) > sys.argv.index('--sheet') + 1 else '/tmp/skin-sheet.png')
    else:
        write()
