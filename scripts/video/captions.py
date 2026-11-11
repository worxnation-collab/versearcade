#!/usr/bin/env python3
"""Burn spoken-word captions onto a voiced cut — the engine's caption style.

    python3 scripts/video/captions.py <in.mp4> <out.mp4> [script.txt]

The same look as the posted videos (lib/tiktokRender.ts drawCaption): Baloo 2
ExtraBold, white with a dark outline, a few words at a time, each word
APPEARING as it is spoken and the word being spoken lit gold. Words not yet
said are drawn fully transparent in the place they will land, so nothing
reflows. Timings come from Whisper on the video's own audio (faster-whisper,
base.en), so they match what is heard. With a script (voiceover.txt) the
WORDS come from the script and only the TIMES from Whisper, aligned by
sequence: Whisper heard "Manna Rush" as "mana rush" one run and "mannehrush"
the next, and a caption must never print a mishearing. A script word Whisper
missed is timed between its neighbours. Without one, FIX patches the usual.

The app is shrunk into a rounded frame at the top and the captions get a band
of their own underneath. Laid over the recording they covered the "Good to
know" card, the one moment the video exists to show, and every screen in the
app has something at the bottom (the gold button, the nav) a caption would sit
on. A band covers nothing.
"""
import difflib, os, re, subprocess, sys, wave, tempfile
import numpy as np
from faster_whisper import WhisperModel

SRC, OUT = sys.argv[1], sys.argv[2]
SCRIPT = sys.argv[3] if len(sys.argv) > 3 else None
HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, 'fonts')

# Whisper's spellings of things it cannot know. Lower-case token → caption.
FIX = {'1': 'One', '5': 'five', 'too?': 'to?', 'too': 'to', 'mana': 'Manna', 'rush,': 'Rush,',
       'gathered': 'Gather', 'sermons': "sermon's", 'verserk.org.': 'versearcade.org',
       'versearcade.org.': 'versearcade.org', 'verse-arcade.org.': 'versearcade.org'}
SIZE, MAX_LINE, MAX_WORDS = 94, 18, 6
# The app frame: 84% of the screen, centred, 24px from the top; the band under it.
SCALE, TOP, RADIUS = 0.84, 24, 44
APP_W, APP_H = int(1080 * SCALE) // 2 * 2, int(1920 * SCALE) // 2 * 2
BG = '0x0e0a0c'      # --bg-0
GOLD = '&H3FD2FF&'          # #ffd23f as ASS BGR
INK = '&H0020070B'          # rgba(11,7,32) outline


def words():
    tmp = tempfile.mktemp(suffix='.wav')
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', SRC, '-ac', '1', '-ar', '16000', tmp], check=True)
    w = wave.open(tmp)
    a = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
    segs, _ = WhisperModel('base.en', compute_type='int8').transcribe(a, word_timestamps=True)
    out = []
    for s in segs:
        for x in s.words:
            t = x.word.strip()
            if not t:
                continue
            if t.startswith('.') and out:      # "versearcade" + ".org."
                out[-1] = (out[-1][0] + t, out[-1][1], x.end); continue
            out.append((t, x.start, x.end))
    return [(FIX.get(t.lower(), t), a_, b) for t, a_, b in out]


def norm(t):
    return re.sub(r"[^a-z0-9]", '', t.lower())


def align(heard, script):
    """Script words, Whisper's times. Unmatched script words are spread evenly
    across the gap between the matched words either side of them."""
    said = script.split()
    sm = difflib.SequenceMatcher(None, [norm(w) for w in said], [norm(h[0]) for h in heard], autojunk=False)
    times = [None] * len(said)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == 'equal' or (tag == 'replace' and i2 - i1 == j2 - j1):
            for k in range(i2 - i1):
                times[i1 + k] = (heard[j1 + k][1], heard[j1 + k][2])
        elif tag == 'replace':   # n script words over m heard ones: share the span
            a, b = heard[j1][1], heard[j2 - 1][2]
            for k in range(i2 - i1):
                times[i1 + k] = (a + (b - a) * k / (i2 - i1), a + (b - a) * (k + 1) / (i2 - i1))
    for i in range(len(said)):
        if times[i] is None:
            prev = next((times[k][1] for k in range(i - 1, -1, -1) if times[k]), 0.0)
            nxt = next((times[k][0] for k in range(i + 1, len(said)) if times[k]), prev + 0.3)
            times[i] = (prev, max(prev + 0.05, (prev + nxt) / 2))
    return [(w, a, b) for w, (a, b) in zip(said, times)]


def chunks(ws):
    """A few words at a time, broken at punctuation, never past two lines."""
    cur, out = [], []
    for w in ws:
        cur.append(w)
        text = ' '.join(x[0] for x in cur)
        if re.search(r'[.?!,]$', w[0]) or len(cur) >= MAX_WORDS or len(text) > MAX_LINE * 2 - 4:
            out.append(cur); cur = []
    if cur:
        out.append(cur)
    return out


def lines(n_words, texts):
    """Where to put the line break: balance the two lines by characters."""
    total = len(' '.join(texts))
    if total <= MAX_LINE + 4:
        return None
    best, run = 1, 0
    for i in range(1, n_words):
        run = len(' '.join(texts[:i]))
        if abs(total / 2 - run) < abs(total / 2 - len(' '.join(texts[:best]))):
            best = i
    return best


def ts(t):
    t = max(0, t)
    return f'{int(t // 3600)}:{int(t % 3600 // 60):02d}:{t % 60:05.2f}'


ws = words()
if SCRIPT:
    ws = align(ws, open(SCRIPT).read())
cs = chunks(ws)
ev = []
for ci, c in enumerate(cs):
    texts = [w[0] for w in c]
    br = lines(len(c), texts)
    nxt = cs[ci + 1][0][1] if ci + 1 < len(cs) else c[-1][2] + 1.5
    for i, (_, start, end) in enumerate(c):
        stop = c[i + 1][1] if i + 1 < len(c) else min(nxt, c[-1][2] + 0.8)
        parts = []
        for j, t in enumerate(texts):
            if j == br:
                parts.append('\\N')
            t = t.replace('{', '').replace('}', '')
            if j < i:
                parts.append('{\\alpha&H00&\\c&HFFFFFF&}' + t)
            elif j == i:
                parts.append('{\\alpha&H00&\\c' + GOLD + '}' + t)
            else:
                parts.append('{\\alpha&HFF&}' + t)
        body = ' '.join(parts).replace(' \\N ', '\\N')
        ev.append(f'Dialogue: 0,{ts(start)},{ts(stop)},W,,0,0,0,,{body}')

ass = f"""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: W,Baloo 2 ExtraBold,{SIZE},&H00FFFFFF,&H00FFFFFF,{INK},&H80000000,-1,0,0,0,100,100,0,0,1,7,2,2,40,40,46,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
""" + '\n'.join(ev) + '\n'
sub = os.path.splitext(OUT)[0] + '.ass'
open(sub, 'w').write(ass)
# A rounded-corner mask for the app frame.
mask = os.path.splitext(OUT)[0] + '-mask.png'
from PIL import Image, ImageDraw
m = Image.new('L', (APP_W, APP_H), 0)
ImageDraw.Draw(m).rounded_rectangle([0, 0, APP_W - 1, APP_H - 1], RADIUS, fill=255)
m.save(mask)
x0 = (1080 - APP_W) // 2
dur = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', SRC],
                     capture_output=True, text=True).stdout.strip()
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', SRC, '-loop', '1', '-t', dur, '-i', mask, '-filter_complex',
                f'[0:v]scale={APP_W}:{APP_H}[app];[1:v]format=gray[m];[app][m]alphamerge[r];'
                f'color=c={BG}:s=1080x1920:r=30[bg];[bg][r]overlay={x0}:{TOP}:shortest=1,ass={sub}:fontsdir={FONTS}',
                '-c:v', 'libx264', '-crf', '18', '-preset', 'fast', '-c:a', 'copy', '-shortest', '-movflags', '+faststart', OUT], check=True)
print(len(cs), 'captions,', len(ev), 'word events ->', OUT)
