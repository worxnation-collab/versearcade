#!/usr/bin/env python3
"""Render the Verse Arcade 48-hour update carousel as 1080x1080 PNGs.

Design language is lifted from src/index.css: deep violet night sky, gold /
coral / grape accents, Baloo 2 display type, chunky rounded shapes.
"""
import json
import math
import os
import pathlib
import random
import subprocess

from PIL import Image

HERE = pathlib.Path(__file__).parent
OUT = HERE / "out"
OUT.mkdir(exist_ok=True)
FONT = json.loads((HERE / "fonts.json").read_text())["700"]

# palette (src/index.css)
BG0, BG1, BG2 = "#0b0720", "#150a34", "#1e0f47"
INK, DIM, FAINT = "#ffffff", "#b8a9e0", "#7a6ba8"
GRAPE, GRAPE_DEEP = "#a06bff", "#7a3ff2"
GOLD, CORAL, MINT, SKY, TANGERINE = "#ffd23f", "#ff6b6b", "#4ecdc4", "#5ee7df", "#ff9f1c"
GOOD = "#43e97b"

# church art colours (src/features/church/ChurchArt.tsx)
WALL, WALL_SHADE = "#f3ecdd", "#cfc3ad"
STONE, STONE_SHADE = "#ddd5ef", "#b6a9d6"
ROOF, ROOF_DARK, DOOR = "#7a3ff2", "#4a2a9e", "#33206b"
GLASS, GLASS_DEEP = "#ffd23f", "#ff9f1c"


def stars(seed, n=90):
    rnd = random.Random(seed)
    out = []
    for _ in range(n):
        x, y = rnd.uniform(0, 100), rnd.uniform(0, 100)
        r = rnd.choice([1.2, 1.6, 2.0, 2.6, 3.4])
        o = rnd.uniform(0.15, 0.6)
        out.append(
            f'<circle cx="{x:.2f}%" cy="{y:.2f}%" r="{r}" fill="#fff" opacity="{o:.2f}"/>'
        )
    # a few gold sparkles
    for _ in range(7):
        x, y = rnd.uniform(4, 96), rnd.uniform(4, 96)
        s = rnd.uniform(7, 13)
        out.append(
            f'<path transform="translate({x*10.8:.0f},{y*10.8:.0f})" '
            f'd="M0 {-s} L{s*0.28:.1f} {-s*0.28:.1f} L{s} 0 L{s*0.28:.1f} {s*0.28:.1f} '
            f'L0 {s} L{-s*0.28:.1f} {s*0.28:.1f} L{-s} 0 L{-s*0.28:.1f} {-s*0.28:.1f} Z" '
            f'fill="{GOLD}" opacity="{rnd.uniform(0.25,0.65):.2f}"/>'
        )
    return "".join(out)


# --- art ------------------------------------------------------------------

def cross(x, y, h, sw=3, fill=GOLD, w=None):
    arm = w if w else h * 0.62
    return (
        f'<rect x="{x-sw/2}" y="{y}" width="{sw}" height="{h}" rx="{sw/2}" fill="{fill}"/>'
        f'<rect x="{x-arm/2}" y="{y+h*0.26}" width="{arm}" height="{sw}" rx="{sw/2}" fill="{fill}"/>'
    )


def arch(x, y, w, h, fill=GLASS):
    r = w / 2
    return f'<path d="M{x-r} {y+h} V{y+r} a{r} {r} 0 0 1 {w} 0 V{y+h} Z" fill="{fill}"/>'


GATHERING = f"""
<ellipse cx="100" cy="151" rx="40" ry="7" fill="#0b0720" opacity="0.4"/>
<rect x="66" y="106" width="68" height="42" rx="2" fill="{WALL}"/>
<rect x="100" y="106" width="34" height="42" fill="{WALL_SHADE}" opacity="0.35"/>
<path d="M100 74 L148 110 L52 110 Z" fill="{ROOF}"/>
<path d="M100 74 L148 110 L100 110 Z" fill="{ROOF_DARK}" opacity="0.5"/>
<path d="M92 148 v-20 a8 8 0 0 1 16 0 v20 z" fill="{DOOR}"/>
<rect x="74" y="118" width="11" height="11" rx="2" fill="{GLASS}"/>
<rect x="115" y="118" width="11" height="11" rx="2" fill="{GLASS}"/>
{cross(100, 60, 13, 2.6)}
"""

BASILICA = f"""
<circle cx="100" cy="82" r="80" fill="{GOLD}" opacity="0.10"/>
<ellipse cx="100" cy="151" rx="82" ry="7" fill="#0b0720" opacity="0.4"/>
<rect x="18" y="88" width="26" height="60" rx="2" fill="{STONE}"/>
<path d="M31 62 L46 90 L16 90 Z" fill="{ROOF_DARK}"/>{cross(31, 50, 12, 2.2)}
<rect x="156" y="88" width="26" height="60" rx="2" fill="{STONE}"/>
<rect x="169" y="88" width="13" height="60" fill="{STONE_SHADE}" opacity="0.45"/>
<path d="M169 62 L184 90 L154 90 Z" fill="{ROOF_DARK}"/>{cross(169, 50, 12, 2.2)}
<path d="M66 82 a34 40 0 0 1 68 0 z" fill="{GOLD}"/>
<path d="M100 42 a34 40 0 0 1 34 40 h-34 z" fill="{GLASS_DEEP}" opacity="0.55"/>
<g stroke="{GLASS_DEEP}" stroke-width="1.4" opacity="0.7" fill="none">
  <path d="M84 82 a24 40 0 0 1 0 -34"/><path d="M116 82 a24 40 0 0 0 0 -34"/></g>
<rect x="62" y="80" width="76" height="8" rx="3" fill="{STONE_SHADE}"/>
<rect x="92" y="30" width="16" height="14" rx="2" fill="{STONE}"/>
<path d="M100 22 L110 32 L90 32 Z" fill="{GOLD}"/>{cross(100, 6, 17, 2.8)}
<rect x="44" y="88" width="112" height="60" rx="2" fill="{STONE}"/>
<rect x="100" y="88" width="56" height="60" fill="{STONE_SHADE}" opacity="0.3"/>
<path d="M100 86 L152 108 L48 108 Z" fill="{STONE_SHADE}" opacity="0.9"/>
<g fill="{WALL}"><rect x="54" y="112" width="8" height="36" rx="3"/>
<rect x="70" y="112" width="8" height="36" rx="3"/>
<rect x="122" y="112" width="8" height="36" rx="3"/>
<rect x="138" y="112" width="8" height="36" rx="3"/></g>
<rect x="48" y="108" width="104" height="6" rx="2" fill="{GOLD}" opacity="0.8"/>
{arch(100, 116, 30, 32, DOOR)}{arch(100, 118, 20, 22, GLASS)}
"""

CHAPEL = f"""
<ellipse cx="100" cy="151" rx="52" ry="7" fill="#0b0720" opacity="0.4"/>
<rect x="60" y="96" width="80" height="52" rx="2" fill="{WALL}"/>
<rect x="100" y="96" width="40" height="52" fill="{WALL_SHADE}" opacity="0.3"/>
<path d="M100 62 L152 100 L48 100 Z" fill="{ROOF}"/>
<path d="M100 62 L152 100 L100 100 Z" fill="{ROOF_DARK}" opacity="0.5"/>
{arch(100, 120, 24, 28, DOOR)}
{arch(72, 110, 14, 20)}{arch(128, 110, 14, 20)}
{cross(100, 44, 16, 3)}
"""


def book_icon(size=200):
    """The PWA icon motif: a glowing book with a sparkle (assets/icon.svg)."""
    return f"""
<svg viewBox="0 0 200 200" width="{size}" height="{size}">
  <defs>
    <linearGradient id="bi" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7b2ff7"/><stop offset="0.55" stop-color="#9b2ff0"/>
      <stop offset="1" stop-color="#f72fb0"/></linearGradient>
    <linearGradient id="bp" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#efeaff"/></linearGradient>
  </defs>
  <rect width="200" height="200" rx="46" fill="url(#bi)"/>
  <path d="M40 68 q30 -14 58 -4 v92 q-28 -12 -58 2 z" fill="url(#bp)"/>
  <path d="M160 68 q-30 -14 -58 -4 v92 q28 -12 58 2 z" fill="url(#bp)" opacity="0.92"/>
  <rect x="96" y="60" width="8" height="98" rx="4" fill="{GOLD}"/>
  <g stroke="#c9bce8" stroke-width="3" stroke-linecap="round">
    <path d="M56 92 h30"/><path d="M56 108 h26"/><path d="M114 92 h30"/><path d="M114 108 h26"/></g>
  <path d="M150 34 l7 17 17 7 -17 7 -7 17 -7 -17 -17 -7 17 -7z" fill="#fff"/>
</svg>"""


def wing(flip=False):
    t = 'transform="scale(-1,1)"' if flip else ""
    return f"""<g {t}>
  <path d="M0 0 C -30 -22 -74 -30 -116 -18 C -84 -6 -60 6 -34 22 C -54 20 -78 22 -100 30
           C -66 40 -38 46 -12 44 Z" fill="url(#wg)"/>
  <path d="M0 0 C -26 -16 -58 -22 -90 -14" stroke="#fff" stroke-opacity="0.5" stroke-width="2.5" fill="none"/>
</g>"""


# --- slide shell ----------------------------------------------------------

CSS = f"""
@font-face {{ font-family:'Baloo 2'; font-weight:100 900;
  src:url(data:font/woff2;base64,{FONT}) format('woff2'); }}
*{{box-sizing:border-box;margin:0;padding:0}}
html,body{{width:1080px;height:1080px;overflow:hidden}}
body{{font-family:'Baloo 2','Noto Color Emoji',sans-serif;color:{INK};
  background:{BG0};-webkit-font-smoothing:antialiased}}
.slide{{position:relative;width:1080px;height:1080px;overflow:hidden;
  display:flex;flex-direction:column;padding:52px 60px 44px;
  background:
    radial-gradient(900px 620px at 50% -12%, #34197e 0%, transparent 62%),
    radial-gradient(760px 560px at 108% 106%, #4a1f6e 0%, transparent 58%),
    radial-gradient(620px 500px at -10% 92%, #2a1568 0%, transparent 60%),
    linear-gradient(180deg,{BG1},{BG0});}}
.stars{{position:absolute;inset:0;width:100%;height:100%}}
.vignette{{position:absolute;inset:0;
  background:radial-gradient(120% 90% at 50% 45%, transparent 55%, rgba(6,3,18,.55) 100%)}}
header,main,footer{{position:relative;z-index:2}}
header{{display:flex;align-items:center;justify-content:space-between}}
.brand{{display:flex;align-items:center;gap:14px;font-weight:800;font-size:27px;
  letter-spacing:.18em;color:{GOLD};text-transform:uppercase}}
.brand .mark{{width:44px;height:44px;border-radius:13px;
  background:linear-gradient(135deg,#7b2ff7,#f72fb0);display:flex;align-items:center;
  justify-content:center;box-shadow:0 6px 20px rgba(160,107,255,.5)}}
.counter{{font-weight:800;font-size:25px;letter-spacing:.1em;color:{DIM};
  border:2px solid rgba(255,255,255,.16);border-radius:999px;padding:9px 22px;
  background:rgba(255,255,255,.05)}}
main{{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:24px}}
.kicker{{display:inline-flex;align-items:center;gap:12px;align-self:flex-start;
  font-weight:800;font-size:25px;letter-spacing:.16em;text-transform:uppercase;
  padding:11px 24px;border-radius:999px}}
h1{{font-weight:800;font-size:84px;line-height:.98;letter-spacing:-.03em}}
h1.sm{{font-size:72px}}
h1.xs{{font-size:64px}}
.body{{font-size:35px;line-height:1.32;color:{DIM};font-weight:500;max-width:900px}}
.body b{{color:{INK};font-weight:800}}
.hi{{background:linear-gradient(92deg,{GOLD},{CORAL} 55%,{GRAPE});
  -webkit-background-clip:text;background-clip:text;color:transparent}}
footer{{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;
  border-top:2px solid rgba(255,255,255,.10);padding-top:24px;margin-top:22px}}
.dots{{display:flex;gap:11px}}
.dot{{width:13px;height:13px;border-radius:999px;background:rgba(255,255,255,.20)}}
.dot.on{{background:{GOLD};box-shadow:0 0 16px rgba(255,210,63,.8)}}
.swipe{{font-weight:800;font-size:27px;letter-spacing:.12em;color:{GOLD};
  text-transform:uppercase;display:flex;align-items:center;gap:12px}}
.card{{background:rgba(255,255,255,.06);border:2px solid rgba(255,255,255,.13);
  border-radius:30px;backdrop-filter:blur(6px);box-shadow:0 14px 40px rgba(0,0,0,.35)}}
.stage{{display:flex;align-items:center;justify-content:center}}
.chip{{display:inline-flex;align-items:center;gap:10px;padding:12px 24px;border-radius:999px;
  background:rgba(255,255,255,.07);border:2px solid rgba(255,255,255,.14);
  font-weight:800;font-size:28px;color:{DIM}}}
.chip.on{{background:linear-gradient(135deg,{GOLD},{TANGERINE});color:#2a1568;
  border-color:transparent;box-shadow:0 8px 26px rgba(255,210,63,.45)}}
"""


def slide(idx, total, kicker, kick_bg, kick_fg, title, body, stage, swipe="Swipe", title_cls=""):
    dots = "".join(
        f'<span class="dot{" on" if i == idx - 1 else ""}"></span>' for i in range(total)
    )
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body>
<div class="slide">
  <svg class="stars">{stars(idx * 17 + 3)}</svg><div class="vignette"></div>
  <header>
    <div class="brand"><span class="mark">{book_icon(30)}</span>Verse Arcade</div>
    <div class="counter">{idx:02d} / {total:02d}</div>
  </header>
  <main>
    <span class="kicker" style="background:{kick_bg};color:{kick_fg}">{kicker}</span>
    <h1 class="{title_cls}">{title}</h1>
    {f'<p class="body">{body}</p>' if body else ''}
    {stage}
  </main>
  <footer><div class="dots">{dots}</div>
    <div class="swipe">{swipe}</div></footer>
</div></body></html>"""


# --- stages ---------------------------------------------------------------

def stat(value, label, color=GOLD):
    return f"""<div class="card" style="flex:1;padding:30px 22px;text-align:center">
  <div style="font-size:78px;font-weight:800;line-height:1;color:{color}">{value}</div>
  <div style="font-size:23px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;
       color:{FAINT};margin-top:10px">{label}</div></div>"""


SLIDES = []

# 1 — cover ---------------------------------------------------------------
SLIDES.append(dict(
    kicker="Two days. One sprint.",
    kick_bg=f"linear-gradient(135deg,{CORAL},{TANGERINE})", kick_fg="#2a1568",
    title='48 HOURS<br><span class="hi">OF UPGRADES</span>',
    body="Verse Arcade just got the biggest drop it has ever had. Nineteen updates, one at a time — swipe through them all. 👇",
    stage=f"""<div style="display:flex;gap:20px;margin-top:14px">
      {stat("19", "updates shipped")}{stat("726", "verses live", MINT)}{stat("66", "books covered", CORAL)}</div>""",
    swipe="Swipe ›››",
))

# 2 — church --------------------------------------------------------------
SLIDES.append(dict(
    kicker="★ Brand new tab",
    kick_bg=f"linear-gradient(135deg,{GOLD},{TANGERINE})", kick_fg="#2a1568",
    title='PLAY FOR<br>YOUR <span class="hi">CHURCH</span>',
    body="Find the church you actually attend, then every verse you nail pours points into it. Your building grows through <b>8 tiers</b> — from a house gathering to a full basilica.",
    title_cls="sm",
    stage=f"""<div class="stage" style="gap:28px;margin-top:6px">
      <svg viewBox="0 0 200 160" width="230" height="184" style="opacity:.85">{GATHERING}</svg>
      <div style="font-size:64px;color:{GOLD};font-weight:800">›</div>
      <svg viewBox="0 0 200 160" width="230" height="184" style="opacity:.9">{CHAPEL}</svg>
      <div style="font-size:64px;color:{GOLD};font-weight:800">›</div>
      <svg viewBox="0 0 200 160" width="300" height="240"
           style="filter:drop-shadow(0 0 34px rgba(255,210,63,.45))">{BASILICA}</svg>
    </div>
    <div style="text-align:center;font-size:26px;font-weight:800;letter-spacing:.1em;
         text-transform:uppercase;color:{FAINT}">Giving costs you nothing — your own XP never drops</div>""",
))

# 3 — church board --------------------------------------------------------
def board_row(rank, name, tier_svg, pts, hot=False):
    bg = ("linear-gradient(135deg,rgba(255,210,63,.18),rgba(255,159,28,.10))"
          if hot else "rgba(255,255,255,.05)")
    bd = GOLD if hot else "rgba(255,255,255,.12)"
    return f"""<div style="display:flex;align-items:center;gap:22px;padding:16px 26px;
      background:{bg};border:2px solid {bd};border-radius:24px">
      <div style="font-size:36px;font-weight:800;color:{GOLD};width:56px">#{rank}</div>
      <svg viewBox="0 0 200 160" width="78" height="62">{tier_svg}</svg>
      <div style="flex:1;font-size:33px;font-weight:800">{name}</div>
      <div style="font-size:31px;font-weight:800;color:{MINT}">{pts}</div></div>"""


SLIDES.append(dict(
    kicker="Church board",
    kick_bg=f"linear-gradient(135deg,{MINT},{SKY})", kick_fg="#0b3b38",
    title='YOUR TOWN.<br>OR THE <span class="hi">WHOLE WORLD.</span>',
    body="Race the congregations 10 miles away — or tap the new <b>All</b> chip and see every active church on earth on one ladder.",
    title_cls="sm",
    stage=f"""<div style="display:flex;gap:14px;justify-content:center;margin:2px 0 4px">
      <span class="chip">10 mi</span><span class="chip">20 mi</span><span class="chip">30 mi</span>
      <span class="chip">50 mi</span><span class="chip on">🌍 All · NEW</span></div>
    <div style="display:flex;flex-direction:column;gap:14px">
      {board_row(1, "Grace Chapel", BASILICA, "48,120", hot=True)}
      {board_row(2, "St. Mary's", CHAPEL, "31,455")}
      {board_row(3, "New Hope Fellowship", GATHERING, "22,980")}
    </div>""",
))

# 4 — verses --------------------------------------------------------------
books = ("Gen Ex Lev Num Deut Josh Judg Ruth 1Sa 2Sa 1Ki 2Ki 1Ch 2Ch Ezr Neh Est Job Ps Pr "
         "Ecc Song Isa Jer Lam Eze Dan Hos Joel Amos Ob Jon Mic Nah Hab Zep Hag Zec Mal "
         "Matt Mark Luke John Acts Rom 1Co 2Co Gal Eph Php Col 1Th 2Th 1Ti 2Ti Tit Phm Heb "
         "Jas 1Pe 2Pe 1Jn 2Jn 3Jn Jude Rev").split()
tiles = "".join(
    f'<span style="padding:9px 0;width:96px;text-align:center;border-radius:12px;font-size:22px;'
    f'font-weight:800;background:rgba(255,210,63,.12);border:2px solid rgba(255,210,63,.30);'
    f'color:{GOLD}">{b}</span>' for b in books
)
SLIDES.append(dict(
    kicker="Verse pool",
    kick_bg=f"linear-gradient(135deg,{GRAPE},{GRAPE_DEEP})", kick_fg="#ffffff",
    title='250 <span class="hi">➜ 726 VERSES</span>',
    body="All <b>66 books</b> are in the rotation now — at least 10 verses each, Genesis to Revelation. Every one of them still drops the same for everybody, every day.",
    title_cls="sm",
    stage=f"""<div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;
      max-height:330px;overflow:hidden">{tiles}</div>""",
))

# 5 — study ---------------------------------------------------------------
bars = [("Obadiah", 34, CORAL), ("Nahum", 41, CORAL), ("Habakkuk", 55, GOLD),
        ("Titus", 68, GOLD), ("Jonah", 82, MINT), ("John", 94, MINT)]
bar_html = "".join(
    f"""<div style="display:flex;align-items:center;gap:20px">
      <div style="width:230px;text-align:right;font-size:29px;font-weight:800;color:{DIM}">{n}</div>
      <div style="flex:1;height:44px;border-radius:999px;background:rgba(255,255,255,.07);
           border:2px solid rgba(255,255,255,.10);overflow:hidden">
        <div style="width:{v}%;height:100%;border-radius:999px;
             background:linear-gradient(90deg,{c},{c}cc)"></div></div>
      <div style="width:96px;font-size:29px;font-weight:800;color:{c}">{v}%</div></div>"""
    for n, v, c in bars
)
SLIDES.append(dict(
    kicker="Study tab",
    kick_bg=f"linear-gradient(135deg,{MINT},{GOOD})", kick_fg="#08301f",
    title='KNOW YOUR<br><span class="hi">WEAK SPOTS</span>',
    body="Study now tracks your accuracy <b>book by book</b> and charts it weakest-first, so you always know exactly what to shore up. No ranks. No losers. Just growth.",
    title_cls="sm",
    stage=f'<div style="display:flex;flex-direction:column;gap:16px;margin-top:4px">{bar_html}</div>',
))

# 6 — focus ---------------------------------------------------------------
SLIDES.append(dict(
    kicker="Focus practice · restored",
    kick_bg=f"linear-gradient(135deg,{CORAL},{GRAPE})", kick_fg="#ffffff",
    title='DRILL IT.<br><span class="hi">LIVE.</span>',
    body="Focus practice is back — pick a book, drill it against a <b>live CPU opponent</b>, and bank daily XP while you do it.",
    title_cls="sm",
    stage=f"""<div style="display:flex;align-items:center;gap:34px;margin-top:8px">
      <div class="card" style="flex:1;padding:34px;text-align:center">
        <div style="font-size:34px;font-weight:800;color:{FAINT};letter-spacing:.1em;
             text-transform:uppercase">You</div>
        <div style="font-size:104px;font-weight:800;line-height:1.05;color:{GOLD}">4</div>
        <div style="height:16px;border-radius:999px;background:rgba(255,255,255,.10);overflow:hidden">
          <div style="width:80%;height:100%;background:linear-gradient(90deg,{GOLD},{TANGERINE})"></div></div>
      </div>
      <div style="font-size:58px;font-weight:800;color:{CORAL}">VS</div>
      <div class="card" style="flex:1;padding:34px;text-align:center">
        <div style="font-size:34px;font-weight:800;color:{FAINT};letter-spacing:.1em;
             text-transform:uppercase">CPU</div>
        <div style="font-size:104px;font-weight:800;line-height:1.05;color:{GRAPE}">3</div>
        <div style="height:16px;border-radius:999px;background:rgba(255,255,255,.10);overflow:hidden">
          <div style="width:60%;height:100%;background:linear-gradient(90deg,{GRAPE},{GRAPE_DEEP})"></div></div>
      </div></div>
    <div style="text-align:center;margin-top:10px;font-size:30px;font-weight:800;color:{MINT}">
      +120 XP banked today</div>""",
))

# 7 — battle hub ----------------------------------------------------------
def turn_btn(label, count, color, bright=False):
    bg = (f"linear-gradient(135deg,{color},{color}bb)" if bright else "rgba(255,255,255,.06)")
    return f"""<div style="flex:1;padding:34px 20px;border-radius:28px;text-align:center;
      background:{bg};border:2px solid {'transparent' if bright else 'rgba(255,255,255,.13)'};
      {'box-shadow:0 12px 34px rgba(255,107,107,.40)' if bright else ''}">
      <div style="font-size:72px;font-weight:800;line-height:1;
           color:{'#2a1568' if bright else INK}">{count}</div>
      <div style="font-size:29px;font-weight:800;margin-top:8px;
           color:{'#2a1568' if bright else DIM}">{label}</div></div>"""


SLIDES.append(dict(
    kicker="⚔️ Battle hub",
    kick_bg=f"linear-gradient(135deg,{CORAL},{TANGERINE})", kick_fg="#2a1568",
    title='NEVER MISS<br><span class="hi">YOUR TURN</span>',
    body="One messy battle list became three clear buttons — with the waiting count right on the button. You always know who's waiting on you.",
    title_cls="sm",
    stage=f"""<div style="display:flex;gap:20px;margin-top:10px">
      {turn_btn("Your turn", 3, CORAL, bright=True)}
      {turn_btn("Their turn", 5, GRAPE)}
      {turn_btn("Finished", 12, MINT)}</div>""",
))

# 8 — player cards --------------------------------------------------------
SLIDES.append(dict(
    kicker="Player cards",
    kick_bg=f"linear-gradient(135deg,{SKY},{GRAPE})", kick_fg="#0b1f3b",
    title='TAP ANY FACE.<br><span class="hi">CHALLENGE THEM.</span>',
    body="Every avatar is now a card you can open — add a buddy or fire off a battle straight from it. Plus four clean tabs, and <b>vs CPU</b> is back.",
    title_cls="xs",
    stage=f"""<div style="display:flex;gap:26px;align-items:stretch;margin-top:4px">
      <div class="card" style="width:380px;padding:22px;text-align:center;
           background:linear-gradient(160deg,rgba(160,107,255,.30),rgba(94,231,223,.12))">
        <div style="width:124px;height:124px;border-radius:999px;margin:0 auto;
             background:linear-gradient(135deg,{GOLD},{CORAL});border:6px solid rgba(255,255,255,.28);
             display:flex;align-items:center;justify-content:center;font-size:64px">🙂</div>
        <div style="font-size:36px;font-weight:800;margin-top:12px">sharkbait</div>
        <div style="font-size:24px;font-weight:700;color:{FAINT};letter-spacing:.06em">
          LVL 24 · 18-DAY STREAK 🔥</div>
        <div style="display:flex;gap:12px;margin-top:18px">
          <div style="flex:1;padding:14px;border-radius:999px;font-size:26px;font-weight:800;
               background:linear-gradient(135deg,{MINT},{SKY});color:#08302d">+ Buddy</div>
          <div style="flex:1;padding:14px;border-radius:999px;font-size:26px;font-weight:800;
               background:linear-gradient(135deg,{CORAL},{TANGERINE});color:#3b1010">Battle</div>
        </div></div>
      <div style="flex:1;display:flex;flex-direction:column;gap:16px;justify-content:center">
        {"".join(f'''<div style="display:flex;align-items:center;gap:18px;padding:14px 22px;
          border-radius:22px;background:rgba(255,255,255,.05);border:2px solid rgba(255,255,255,.11)">
          <div style="width:50px;height:50px;border-radius:999px;background:{c};
               display:flex;align-items:center;justify-content:center;font-size:30px">{e}</div>
          <div style="font-size:30px;font-weight:800;color:{DIM}">{t}</div></div>'''
          for e, c, t in [("🏠", GRAPE, "Play"), ("📖", MINT, "Study"),
                          ("⛪", GOLD, "Church"), ("🙋", CORAL, "You")])}
      </div></div>""",
))

# 9 — install / reminders -------------------------------------------------
SLIDES.append(dict(
    kicker="Put it on your phone",
    kick_bg=f"linear-gradient(135deg,{GRAPE},{CORAL})", kick_fg="#ffffff",
    title='ONE TAP.<br><span class="hi">REAL APP.</span>',
    body="Add to Home Screen with a single button, get a proper app icon, a 4-step how-to-play walkthrough, and opt-in <b>daily reminders</b> so your streak never dies.",
    title_cls="sm",
    stage=f"""<div style="display:flex;align-items:center;justify-content:center;gap:52px;margin-top:8px">
      <div style="text-align:center">
        <div style="filter:drop-shadow(0 18px 40px rgba(160,107,255,.55))">{book_icon(176)}</div>
        <div style="font-size:28px;font-weight:800;margin-top:16px">Verse Arcade</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:16px">
        {"".join(f'''<div style="display:flex;align-items:center;gap:18px;padding:16px 28px;
          border-radius:22px;background:rgba(255,255,255,.06);border:2px solid rgba(255,255,255,.12);
          font-size:30px;font-weight:800;color:{DIM}"><span style="font-size:32px">{e}</span>{t}</div>'''
          for e, t in [("📲", "Add to Home Screen"), ("🎓", "How to play in 4 steps"),
                       ("🔔", "Daily reminder push"), ("⚡", "Installable PWA")])}
      </div></div>""",
))

# 10 — angel pack ---------------------------------------------------------
def angel_tile(name, c1, c2, emoji):
    return f"""<div style="flex:1;padding:26px 16px;border-radius:26px;text-align:center;
      background:linear-gradient(165deg,{c1}44,{c2}22);border:2px solid {c1}66">
      <div style="font-size:74px;line-height:1.1">{emoji}</div>
      <div style="font-size:29px;font-weight:800;margin-top:8px">{name}</div></div>"""


SLIDES.append(dict(
    kicker="✨ New drop · The Angel Pack",
    kick_bg=f"linear-gradient(135deg,{GOLD},#fff3bf)", kick_fg="#3a2a00",
    title='FIVE ITEMS.<br><span class="hi">ONE BUNDLE.</span>',
    body="Gabriel, Michael and Seraph skins plus the <b>Jacob's Ladder</b> and <b>Heavenly Host</b> calling cards — the whole host for <b>$5.99</b>. Swipe the preview in the shop.",
    title_cls="sm",
    stage=f"""<div style="display:flex;gap:18px;margin-top:6px">
      {angel_tile("Gabriel", GOLD, TANGERINE, "😇")}
      {angel_tile("Michael", SKY, GRAPE, "🗡️")}
      {angel_tile("Seraph", CORAL, GOLD, "🔥")}
      {angel_tile("Jacob's Ladder", GRAPE, SKY, "🪜")}
      {angel_tile("Heavenly Host", MINT, GOLD, "🎺")}</div>
    <div style="text-align:center;margin-top:20px;font-size:31px;font-weight:800;color:{GOLD}">
      All five, or nothing — no cherry-picking</div>""",
))

# 11 — CTA ---------------------------------------------------------------
SLIDES.append(dict(
    kicker="Your move",
    kick_bg=f"linear-gradient(135deg,{CORAL},{GRAPE})", kick_fg="#ffffff",
    title='TODAY\'S VERSE<br><span class="hi">IS ALREADY LIVE</span>',
    body="Same verse, same day, for every player on earth. Take the drop, keep the streak, and put a few thousand points on your church while you're at it.",
    title_cls="sm",
    stage=f"""<div style="display:flex;flex-direction:column;align-items:center;gap:26px;margin-top:10px">
      <div style="padding:26px 68px;border-radius:999px;font-size:44px;font-weight:800;color:#2a1568;
           background:linear-gradient(135deg,{GOLD},{TANGERINE});
           box-shadow:0 14px 40px rgba(255,210,63,.45)">▶  Play today's drop</div>
      <div style="font-size:30px;font-weight:700;color:{DIM};text-align:center;max-width:760px">
        Free to play · No signup to start · Wrong answers still teach you something</div>
      <div style="font-size:34px;font-weight:800;letter-spacing:.06em;color:{GOLD}">
        versearcade.org</div></div>""",
    swipe="Tag a friend 💛",
))

TOTAL = len(SLIDES)
CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"

for i, s in enumerate(SLIDES, 1):
    s.setdefault("swipe", "Swipe ›")
    s.setdefault("title_cls", "")
    html = slide(i, TOTAL, s["kicker"], s["kick_bg"], s["kick_fg"], s["title"],
                 s["body"], s["stage"], s["swipe"], s["title_cls"])
    p = HERE / f"slide-{i:02d}.html"
    p.write_text(html)
    png = OUT / f"verse-arcade-{i:02d}.png"
    subprocess.run([CHROME, "--headless=new", "--no-sandbox", "--disable-gpu",
                    "--hide-scrollbars", "--force-device-scale-factor=1",
                    "--default-background-color=00000000",
                    "--window-size=1080,1167", f"--screenshot={png}", f"file://{p}"],
                   check=True, capture_output=True)
    # chrome's screenshot is the window, not the viewport: 87px of it is chrome
    # itself. Crop back to a clean 1080 square.
    with Image.open(png) as im:
        im.convert("RGB").crop((0, 0, 1080, 1080)).save(png)
    print("rendered", png.name)
