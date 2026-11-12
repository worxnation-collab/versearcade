#!/usr/bin/env python3
"""Word-by-word subtitles for a voiceover, as an ASS file ffmpeg burns in.

    python3 scripts/video/subs.py <whisper.json> <out.ass> [--offset 7.0] [--y 1180]

Reads fal-ai/whisper output with `chunk_level: "word"` and writes captions in
the middle of a 1080x1920 frame: short groups of up to three words that change
as they are spoken, with the word being said lit gold and the rest white, big
and outlined so they read over any screen. A group breaks on punctuation or a
pause, so a caption never runs across a sentence.

Whisper mishears a few product words; FIX corrects them, and LEAD restores
words it drops at the very start of a take (it heard "Verse Arcade" without
the "This is" in front).
"""
import json, sys

src, out = sys.argv[1], sys.argv[2]
arg = lambda k, d: float(sys.argv[sys.argv.index(k) + 1]) if k in sys.argv else d
OFFSET, Y = arg('--offset', 0.0), int(arg('--y', 1180))
# From this time on (the end card, whose own words sit mid-frame) captions drop low.
LOW_AFTER, LOW_Y = arg('--low-after', 1e9), int(arg('--low-y', 1560))

FIX = {'Mana': 'Manna', 'mana': 'manna', 'Raise': 'Race', 'crossword.': 'Cross Word.',
       'crossword': 'Cross Word', 'Crossword.': 'Cross Word.', 'Crossword': 'Cross Word',
       'study': 'Study', 'versearcade.org.': 'versearcade.org'}
words = []
for c in json.load(open(src))['chunks']:
    a, b = c['timestamp']
    t = c['text'].strip()
    if not t:
        continue
    t = FIX.get(t, t)
    words.append([a + OFFSET, (b if b else a + 0.3) + OFFSET, t])
# "This is" before the first word, when whisper dropped it.
if words and words[0][2] == 'Verse' and words[0][0] - OFFSET > 0.5:
    s = words[0][0]
    words[:0] = [[s - 0.5, s - 0.25, 'This'], [s - 0.25, s, 'is']]

# Groups of at most three words; a break after punctuation or a pause.
groups, cur = [], []
for i, w in enumerate(words):
    cur.append(w)
    nxt = words[i + 1] if i + 1 < len(words) else None
    if len(cur) == 4 or (len(cur) == 3 and w[2][-1] not in '.,?!' and nxt and nxt[2][-1] not in '.,?!') or w[2][-1] in '.,?!' or not nxt or nxt[0] - w[1] > 0.35:
        groups.append(cur)
        cur = []


def ts(t):
    t = max(0.0, t)
    return f'{int(t // 3600)}:{int(t % 3600 // 60):02d}:{t % 60:05.2f}'


def esc(t):
    return t.replace('{', '(').replace('}', ')').replace('\\', '')


GOLD, WHITE = '&H003FD2FF&', '&H00FFFFFF&'   # ASS colours are BGR
lines = []
for gi, g in enumerate(groups):
    # Hold a beat after the last word, but never into the next group.
    nxt = groups[gi + 1][0][0] if gi + 1 < len(groups) else 1e9
    end_of_group = min(g[-1][1] + 0.25, nxt)
    for k, w in enumerate(g):
        start = w[0]
        end = g[k + 1][0] if k + 1 < len(g) else end_of_group
        text = ' '.join(('{\\c' + GOLD + '}' if j == k else '{\\c' + WHITE + '}') + esc(x[2]) for j, x in enumerate(g))
        # A small pop on the group's first word only, so the line lands and then holds still.
        pop = '{\\fscx92\\fscy92\\t(0,90,\\fscx100\\fscy100)}' if k == 0 else ''
        lines.append(f'Dialogue: 0,{ts(start)},{ts(end)},Word,,0,0,0,,{{\\pos(540,{LOW_Y if g[0][0] >= LOW_AFTER else Y})}}{pop}{text}')

head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Word,Inter,86,&H00FFFFFF,&H00FFFFFF,&H00140C22,&H96000000,1,0,0,0,100,100,0,0,1,7,3,5,60,60,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
open(out, 'w').write(head + '\n'.join(lines) + '\n')
print(f'{len(words)} words, {len(groups)} groups -> {out}')
