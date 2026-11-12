#!/usr/bin/env python3
"""The FUN cut: a fast vertical promo from the recorded shots (record.mjs).

    python3 scripts/video/cut2.py <dir> [--vo vo.wav] [--music music.mp3]

Same recordings as cut.py, cut like a Short rather than a tour: a living-
painting cold open with a pop quiz, speed ramps (1.5-2.5x) through anything
that is just waiting, punch-in zooms on the moment that matters, big kinetic
captions, a ding on a right answer and a buzz on the wrong one, and a music
bed that ducks under the voice. Timed to docs/PROMO-SCRIPT.md; when the
owner's voiceover exists, pass it as --vo and the music sits under it.

Writes <dir>/verse-arcade-fun.mp4 and <dir>/timing-fun.txt.
"""
import os, subprocess, sys

D = sys.argv[1]
arg = lambda k: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else None
VO, MUSIC = arg('--vo'), arg('--music') or os.path.join(D, 'music.mp3')
FONT = '/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf'
OPEN = os.path.join(os.path.dirname(__file__), '../../public/tiktok/roads/wheat-noon.mp4')
GOLD, WHITE = '#FFD23F', 'white'

# (source, start, end, speed, zoom (cx, cy, scale) or None, [(caption, colour, at)], [(sfx, source_time)])
# Times are in the SOURCE recording; the output is (t - start) / speed.
SEGS = [
    ('open', 0.0, 3.2, 1.0, None, [('POP QUIZ', GOLD, 0.0), ('Finish the verse:', WHITE, 0.7), ('Seek first the kingdom', WHITE, 1.4), ('of God and…', GOLD, 1.4)], [('whoosh', 0.0)]),
    ('open', 3.2, 4.4, 1.0, None, [('3', GOLD, 0.0), ('2', GOLD, 0.4), ('1', GOLD, 0.8)], [('tick', 3.2), ('tick', 3.6), ('tick', 4.0)]),
    ('verse', 17.0, 19.6, 1.0, (0.5, 0.5, 1.2), [('His righteousness!', GOLD, 1.8)], [('ding', 18.9)]),
    ('verse', 0.2, 1.6, 1.0, None, [('This is Verse Arcade', GOLD, 0.0)], [('whoosh', 0.2)]),
    ('verse', 2.4, 5.6, 2.0, None, [('One verse a day.', WHITE, 0.0), ('Same one for everybody.', GOLD, 0.6)], []),
    ('verse', 6.0, 9.0, 1.5, (0.5, 0.62, 1.25), [('5 quick questions', WHITE, 0.0)], [('ding', 7.6)]),
    ('verse', 9.8, 11.4, 1.0, (0.5, 0.55, 1.2), [('Get one wrong?', WHITE, 0.0)], [('buzz', 10.6)]),
    ('verse', 11.4, 14.8, 1.25, (0.5, 0.82, 1.5), [('It tells you WHY.', GOLD, 0.0)], []),
    ('verse', 21.0, 27.0, 2.5, None, [('Build a combo', WHITE, 0.0)], [('ding', 22.2), ('ding', 26.1)]),
    ('verse', 27.6, 30.4, 1.0, (0.5, 0.32, 1.3), [('Keep your streak', GOLD, 0.0)], [('whoosh', 27.6)]),
    ('verse', 31.0, 34.0, 2.0, None, [('Nobody ranked', WHITE, 0.0), ('against friends', WHITE, 0.0)], []),
    ('trivia', 0.4, 4.6, 1.75, None, [('Daily Bible trivia', GOLD, 0.0)], [('whoosh', 0.4)]),
    ('arcade', 2.6, 9.6, 2.0, None, [('An arcade.', WHITE, 0.0), ('(Yes, catching manna.)', GOLD, 1.2)], [('whoosh', 2.6)]),
    ('character', 1.0, 9.0, 2.5, None, [('Build your character', GOLD, 0.0)], [('whoosh', 1.0)]),
    ('card', 0.0, 1.4, 1.0, None, [('PASTORS', GOLD, 0.0), ('this one’s for you', WHITE, 0.3)], [('whoosh', 0.0)]),
    ('pastor', 1.6, 6.4, 1.6, (0.5, 0.7, 1.35), [('Type Sunday’s verse', WHITE, 0.0)], []),
    ('pastor', 6.4, 13.4, 2.5, None, [('It writes the questions', GOLD, 0.0)], [('ding', 12.2)]),
    ('pastor', 14.0, 15.4, 1.0, (0.5, 0.4, 1.25), [('Your whole church plays', WHITE, 0.0), ('your sermon all week', GOLD, 0.0)], [('whoosh', 14.0)]),
    ('pastor', 18.4, 20.6, 1.2, None, [], [('ding', 19.3)]),
    ('people', 0.0, 1.4, 1.0, (0.5, 0.45, 1.15), [('See who’s playing', GOLD, 0.0)], [('whoosh', 0.0)]),
    ('end', 0.0, 4.5, 1.0, None, [], [('ding', 0.2)]),
]


# The LONG cut (--long): about three minutes, the walkthrough the Shorts'
# "Related video" link points at (docs/YOUTUBE-FUNNEL.md). Same grammar,
# slower pace, a chapter card before each part of the app.
LONG = [
    *SEGS[:3],
    ('verse', 0.2, 1.6, 1.0, None, [('This is Verse Arcade', GOLD, 0.0)], [('whoosh', 0.2)]),
    ('verse', 2.4, 5.6, 1.25, None, [('One verse a day.', WHITE, 0.0), ('Same one for everybody.', GOLD, 1.0)], []),
    ('verse', 5.6, 9.4, 1.0, (0.5, 0.62, 1.25), [('Read it. Then 5 questions.', WHITE, 0.0)], [('ding', 7.6)]),
    ('verse', 9.8, 11.4, 1.0, (0.5, 0.55, 1.2), [('Get one wrong?', WHITE, 0.0)], [('buzz', 10.6)]),
    ('verse', 11.4, 16.4, 1.0, (0.5, 0.82, 1.5), [('It tells you WHY.', GOLD, 0.0), ('Wrong answers teach.', WHITE, 1.6)], []),
    ('verse', 20.6, 27.2, 1.5, None, [('Build a combo', WHITE, 0.0)], [('ding', 22.2), ('ding', 26.1)]),
    ('verse', 27.6, 31.0, 1.0, (0.5, 0.32, 1.3), [('Keep your streak', GOLD, 0.0)], [('whoosh', 27.6)]),
    ('verse', 31.0, 34.2, 1.25, None, [('What you learned,', WHITE, 0.0), ('every single day', GOLD, 0.0)], []),
    ('card:trivia@1', 0.0, 1.6, 1.0, None, [('TRIVIA', GOLD, 0.0), ('a new book every day', WHITE, 0.3)], [('whoosh', 0.0)]),
    ('trivia', 0.4, 5.0, 1.25, None, [], [('ding', 3.0)]),
    ('card:battle@3', 0.0, 1.6, 1.0, None, [('BATTLE', GOLD, 0.0), ('race the clock', WHITE, 0.3)], [('whoosh', 0.0)]),
    ('battle', 0.0, 3.4, 1.25, None, [('Pick an opponent', WHITE, 0.0)], []),
    ('battle', 3.4, 16.0, 2.0, None, [('Head to head', GOLD, 0.0)], [('ding', 6.0), ('ding', 9.0), ('ding', 12.0)]),
    ('battle', 16.0, 19.6, 1.0, (0.5, 0.3, 1.25), [('Win or lose,', WHITE, 0.0), ('you learn something', GOLD, 0.0)], [('whoosh', 16.0)]),
    ('card:bible@5', 0.0, 1.6, 1.0, None, [('YOUR BIBLE', GOLD, 0.0), ('all 66 books', WHITE, 0.3)], [('whoosh', 0.0)]),
    ('bible', 0.0, 4.4, 1.25, None, [('Every chapter you open', WHITE, 0.0), ('gets marked', GOLD, 0.0)], []),
    ('bible', 4.4, 9.2, 1.25, None, [('Read it right here', WHITE, 0.0)], []),
    ('seals', 0.0, 2.6, 1.0, None, [('Finish a book,', WHITE, 0.0), ('press its seal', GOLD, 0.0)], [('ding', 0.4)]),
    ('study', 0.0, 8.7, 1.5, None, [('Study with Tabitha', GOLD, 0.0), ('your own progress, no ranks', WHITE, 2.0)], [('whoosh', 0.0)]),
    ('card:arcade@1', 0.0, 1.6, 1.0, None, [('THE ARCADE', GOLD, 0.0)], [('whoosh', 0.0)]),
    ('wordcatch', 1.0, 6.0, 1.5, None, [('Three little games', WHITE, 0.0)], []),
    ('arcade', 2.6, 13.0, 1.75, None, [('Manna Rush', GOLD, 0.0), ('gather six days, rest on the seventh', WHITE, 1.2)], [('whoosh', 2.6)]),
    ('cross', 0.0, 8.1, 1.25, (0.5, 0.45, 1.15), [('Cross Word', GOLD, 0.0), ('it turns to wood', WHITE, 3.6)], [('ding', 6.0)]),
    ('card:you@2', 0.0, 1.6, 1.0, None, [('MAKE IT YOURS', GOLD, 0.0)], [('whoosh', 0.0)]),
    ('character', 0.6, 13.0, 2.0, None, [('Build your character', GOLD, 0.0), ('Hoodie optional', WHITE, 2.4)], []),
    ('you', 0.0, 8.7, 1.5, None, [('Your own room', WHITE, 0.0)], []),
    ('wardrobe', 0.0, 8.7, 1.75, None, [('Everything you can earn', GOLD, 0.0), ('by playing, never by paying', WHITE, 1.6)], []),
    ('journal', 0.0, 5.3, 1.25, None, [('Your journal', WHITE, 0.0)], []),
    ('card:pastor@2', 0.0, 2.0, 1.0, None, [('PASTORS', GOLD, 0.0), ('this part is for you', WHITE, 0.4)], [('whoosh', 0.0)]),
    ('pastor', 1.6, 6.4, 1.25, (0.5, 0.7, 1.35), [('Type Sunday’s verse', WHITE, 0.0)], []),
    ('pastor', 6.4, 13.4, 1.75, None, [('It writes 5 questions', GOLD, 0.0), ('you can edit every one', WHITE, 1.6)], [('ding', 12.2)]),
    ('pastor', 14.0, 17.4, 1.0, (0.5, 0.4, 1.25), [('Your whole church plays', WHITE, 0.0), ('your sermon all week', GOLD, 0.0)], [('whoosh', 14.0)]),
    ('pastor', 17.4, 25.0, 1.5, None, [], [('ding', 19.3), ('ding', 23.4)]),
    ('people', 0.0, 1.4, 1.0, (0.5, 0.45, 1.15), [('See who’s playing', GOLD, 0.0)], [('whoosh', 0.0)]),
    ('pastor2', 0.0, 6.3, 1.0, None, [('Plan a whole series', WHITE, 0.0), ('see how it lands', GOLD, 2.0)], []),
    ('end', 0.0, 8.0, 1.0, None, [], [('ding', 0.2)]),
]
# The VOICED cut (--voiced): the long walkthrough laid to the owner's recorded
# voiceover. Each segment carries 'fit:<seconds>' instead of a speed, so a
# shot lasts exactly as long as the words over it: the speed is worked out
# (never slower than 0.8x) and any remainder holds the last frame. The voice
# starts after the 7-second silent cold open (VO_AT). Fit lengths are the
# gaps between section starts in the processed voiceover
# (docs/PROMO-SCRIPT.md -> "Finishing the voiceover").
VO_AT = 7.0
VOICED = [
    *SEGS[:3],
    ('verse', 0.2, 1.6, 'fit:1.72', None, [('This is Verse Arcade', GOLD, 0.0)], [('whoosh', 0.2)]),
    ('verse', 2.4, 5.6, 'fit:4.14', None, [('One verse a day.', WHITE, 0.0), ('Same one for everybody.', GOLD, 1.4)], []),
    ('verse', 5.6, 9.8, 'fit:4.5', (0.5, 0.62, 1.2), [('Read it. Then 5 questions.', WHITE, 0.0)], [('ding', 7.6)]),
    ('verse', 21.0, 24.6, 'fit:4.38', None, [('Who said it? Who to?', WHITE, 0.0), ('What comes next?', GOLD, 1.6)], []),
    ('verse', 9.8, 11.4, 'fit:3.1', (0.5, 0.55, 1.2), [('Get one wrong?', WHITE, 0.0)], [('buzz', 10.6)]),
    ('verse', 11.4, 16.4, 'fit:7.08', (0.5, 0.82, 1.5), [('It tells you WHY.', GOLD, 0.0), ('Wrong answers teach.', WHITE, 2.4)], []),
    ('verse', 24.0, 27.2, 'fit:2.0', None, [('Build a combo', WHITE, 0.0)], [('ding', 26.1)]),
    ('verse', 27.6, 31.0, 'fit:2.16', (0.5, 0.32, 1.3), [('Keep your streak', GOLD, 0.0)], []),
    ('verse', 31.0, 34.2, 'fit:3.92', None, [('Everything you learned', WHITE, 0.0)], []),
    ('card:trivia@1', 0.0, 1.6, 'fit:1.6', None, [('TRIVIA', GOLD, 0.0), ('one book every day', WHITE, 0.3)], [('whoosh', 0.0)]),
    ('trivia', 0.4, 5.0, 'fit:9.44', (0.5, 0.45, 1.15), [('Today: Matthew', WHITE, 0.0), ('Tomorrow: Obadiah?', GOLD, 5.2)], []),
    ('card:battle@3', 0.0, 1.6, 'fit:1.6', None, [('BATTLE', GOLD, 0.0), ('race the computer', WHITE, 0.3)], [('whoosh', 0.0)]),
    ('battle', 0.0, 3.4, 'fit:2.86', None, [('Rookie. Deacon. Prophet.', WHITE, 0.0)], []),
    ('battle', 3.4, 16.0, 'fit:5.3', None, [('Head to head', GOLD, 0.0)], [('ding', 6.0), ('ding', 12.0)]),
    ('battle', 16.0, 19.6, 'fit:2.54', (0.5, 0.3, 1.25), [('Win or lose,', WHITE, 0.0), ('you learn something', GOLD, 0.0)], []),
    ('card:bible@5', 0.0, 1.6, 'fit:1.6', None, [('YOUR BIBLE', GOLD, 0.0), ('all 66 books', WHITE, 0.3)], [('whoosh', 0.0)]),
    ('bible', 0.0, 4.4, 'fit:3.98', None, [('Every chapter you open', WHITE, 0.0), ('gets marked', GOLD, 0.0)], []),
    ('bible', 4.4, 9.2, 'fit:4.92', None, [('Your Bible fills in', WHITE, 0.0)], []),
    ('seals', 0.0, 2.6, 'fit:5.85', None, [('Finish a book,', WHITE, 0.0), ('press its seal', GOLD, 0.0), ('Just yours.', WHITE, 3.4)], [('ding', 0.4)]),
    ('study', 0.0, 8.7, 'fit:11.06', None, [('Study with Tabitha', GOLD, 0.0), ('No rankings. Ever.', WHITE, 6.0)], [('whoosh', 0.0)]),
    ('card:arcade@1', 0.0, 1.6, 'fit:1.6', None, [('THE ARCADE', GOLD, 0.0)], [('whoosh', 0.0)]),
    ('wordcatch', 1.0, 6.0, 'fit:1.48', None, [('Three little games', WHITE, 0.0)], []),
    ('arcade', 2.6, 13.0, 'fit:4.58', None, [('Manna Rush', GOLD, 0.0), ('six days gather, one day rest', WHITE, 1.0)], []),
    ('wordcatch', 6.0, 11.0, 'fit:4.18', None, [('Word Catch', GOLD, 0.0), ('put the verse back together', WHITE, 0.8)], []),
    ('cross', 0.0, 8.1, 'fit:5.74', (0.5, 0.45, 1.15), [('Cross Word', GOLD, 0.0), ('it turns to wood', WHITE, 3.6)], [('ding', 6.0)]),
    ('character', 0.6, 13.0, 'fit:5.48', None, [('Build your character', GOLD, 0.0), ('Hoodie optional', WHITE, 3.4)], [('whoosh', 0.6)]),
    ('you', 0.0, 4.0, 'fit:1.6', None, [('Your own room', WHITE, 0.0)], []),
    ('wardrobe', 0.0, 8.7, 'fit:3.77', None, [('Earned by playing,', GOLD, 0.0), ('never by paying', WHITE, 0.0)], []),
    ('journal', 0.0, 5.3, 'fit:3.66', None, [('Your journal', WHITE, 0.0)], []),
    ('card:pastor@2', 0.0, 2.0, 'fit:3.38', None, [('PASTORS', GOLD, 0.0), ('this part is for you', WHITE, 0.4)], [('whoosh', 0.0)]),
    ('pastor', 1.6, 6.4, 'fit:2.42', (0.5, 0.7, 1.35), [('Type Sunday’s verse', WHITE, 0.0)], []),
    ('pastor', 6.4, 13.4, 'fit:4.12', None, [('It writes 5 questions', GOLD, 0.0), ('you can edit every one', WHITE, 1.6)], [('ding', 12.2)]),
    ('pastor', 14.0, 19.0, 'fit:5.13', (0.5, 0.4, 1.2), [('Your whole church plays', WHITE, 0.0), ('your sermon all week', GOLD, 0.0)], []),
    ('people', 0.0, 1.4, 'fit:0.98', (0.5, 0.45, 1.15), [('See who’s playing', GOLD, 0.0)], []),
    ('pastor2', 0.0, 6.3, 'fit:3.84', None, [('Plan a whole series', WHITE, 0.0), ('see how it lands', GOLD, 1.6)], []),
    ('end', 0.0, 8.0, 'fit:10.8', None, [], [('ding', 0.2)]),
]
if '--voiced' in sys.argv:
    SEGS = VOICED
PRE = 'voiced' if '--voiced' in sys.argv else 'long' if '--long' in sys.argv else 'fun'
if '--long' in sys.argv:
    SEGS = LONG


def run(*a):
    subprocess.run(a, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def esc(t):
    return t.replace('\\', '\\\\').replace(':', '\\:').replace("'", '’').replace('%', '\\%').replace(',', '\\,')


def src_of(name):
    if name == 'open':
        return OPEN
    if name.startswith('card:'):
        # A chapter card: one blurred, darkened frame of the shot it introduces.
        shot, at = name[5:].split('@')
        out = os.path.join(D, f'card-{shot}-{at}.mp4')
        if not os.path.exists(out):
            png = out[:-4] + '.png'
            run('ffmpeg', '-y', '-ss', at, '-i', os.path.join(D, shot + '.mp4'), '-frames:v', '1', '-vf', 'gblur=sigma=30,eq=brightness=-0.25', png)
            run('ffmpeg', '-y', '-loop', '1', '-t', '4', '-i', png, '-vf', 'fps=30,scale=1080:1920,format=yuv420p', '-c:v', 'libx264', '-crf', '18', out)
        return out
    return os.path.join(D, name + '.mp4')


# The pastor card: a bold title over a blurred frame of the demo.
card = os.path.join(D, 'card.mp4')
if not os.path.exists(card):
    run('ffmpeg', '-y', '-ss', '2', '-i', os.path.join(D, 'pastor.mp4'), '-frames:v', '1', '-vf', 'gblur=sigma=30,eq=brightness=-0.25', os.path.join(D, 'card.png'))
    run('ffmpeg', '-y', '-loop', '1', '-t', '2', '-i', os.path.join(D, 'card.png'), '-vf', 'fps=30,scale=1080:1920,format=yuv420p', '-c:v', 'libx264', '-crf', '18', card)
end = os.path.join(D, 'end.mp4')
if not os.path.exists(end):
    run('ffmpeg', '-y', '-loop', '1', '-t', '9', '-i', os.path.join(D, 'end', 'f00000.jpg'), '-vf', 'fps=30,scale=1080:1920,format=yuv420p', '-c:v', 'libx264', '-crf', '18', end)

parts, sfx, sheet, T = [], [], [], 0.0
for i, (name, a, b, sp, zoom, caps, fx) in enumerate(SEGS):
    hold = 0.0
    if isinstance(sp, str):
        # 'fit:<seconds>': as long as the words over it, never below 0.8x.
        target = float(sp[4:])
        sp = max((b - a) / target, 0.8)
        hold = max(0.0, target - (b - a) / sp)
    dur = (b - a) / sp + hold
    vf = [f'setpts=(PTS-STARTPTS)/{sp}', 'fps=30', *([f'tpad=stop_mode=clone:stop_duration={hold:.3f}'] if hold else []), 'scale=1080:1920:force_original_aspect_ratio=increase', 'crop=1080:1920']
    if zoom:
        cx, cy, z = zoom
        # Punch in over 0.35s, eased, then hold: the moment that matters, big.
        k = f'(1+({z}-1)*min(1\\,t/0.35)*(2-min(1\\,t/0.35)))'
        # scale is evaluated per frame (crop's size is not), then crop slides.
        vf.append(f"scale=w='2*trunc(540*{k})':h='2*trunc(960*{k})':eval=frame")
        vf.append(f"crop=1080:1920:x='(iw-1080)*{cx}':y='(ih-1920)*{cy}'")
    # A two-frame white flash on every cut, so a cut reads as a beat.
    vf.append("drawbox=x=0:y=0:w=iw:h=ih:color=white@0.35:t=fill:enable='lt(t,0.067)'")
    big = len(caps) and all(len(c[0]) <= 2 for c in caps)
    for j, (text, colour, at) in enumerate(caps):
        if big:   # the countdown: one huge number at a time, centred
            until = caps[j + 1][2] if j + 1 < len(caps) else dur
            vf.append(f"drawtext=fontfile={FONT}:text='{esc(text)}':fontsize=360:fontcolor={colour}:borderw=14:bordercolor=black"
                      f":x=(w-text_w)/2:y=(h-text_h)/2-80:enable='between(t,{at},{until})'")
            continue
        size = 92 if len(text) <= 14 else 74 if len(text) <= 22 else 62
        y = 200 + j * (size + 52)
        # Pops in: alpha ramps over 0.12s from its own moment.
        vf.append(f"drawtext=fontfile={FONT}:text='{esc(text)}':fontsize={size}:fontcolor={colour}:borderw=4:bordercolor=black@0.6:box=1:boxcolor=#140c22@0.82:boxborderw=24"
                  f":x=(w-text_w)/2:y={y}:alpha='min(1\\,max(0\\,(t-{at})/0.12))':enable='gte(t,{at})'")
    out = os.path.join(D, f'{PRE}{i:02d}.mp4')
    run('ffmpeg', '-y', '-ss', str(a), '-t', str(b - a), '-i', src_of(name), '-an', '-vf', ','.join(vf),
        '-t', f'{dur:.3f}', '-c:v', 'libx264', '-crf', '18', '-preset', 'fast', '-r', '30', out)
    parts.append(out)
    for kind, st in fx:
        sfx.append((kind, T + max(0.0, (st - a) / sp)))
    sheet.append(f"{T:5.1f}s – {T + dur:5.1f}s  {name:<9} {' / '.join(c[0] for c in caps) or '—'}")
    T += dur

lst = os.path.join(D, f'{PRE}-parts.txt')
open(lst, 'w').write(''.join(f"file '{p}'\n" for p in parts))
video = os.path.join(D, f'{PRE}-video.mp4')
run('ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', video)

# Sound effects, synthesised here: nothing to license, nothing to fetch.
SFX = {
    'ding': 'sine=f=1318:d=0.45[a];sine=f=1976:d=0.45[b];[a][b]amix=2,afade=t=out:st=0.05:d=0.4,volume=0.55',
    'buzz': 'sine=f=150:d=0.38,aeval=sgn(val(0))*0.35,afade=t=out:st=0.25:d=0.13',
    'tick': 'sine=f=2200:d=0.06,afade=t=out:st=0.01:d=0.05,volume=0.6',
    'whoosh': 'anoisesrc=d=0.4:c=pink:a=0.5,highpass=f=600,lowpass=f=5000,afade=t=in:d=0.15,afade=t=out:st=0.15:d=0.25,volume=0.45',
}
for k, g in SFX.items():
    p = os.path.join(D, f'sfx-{k}.wav')
    if not os.path.exists(p):
        if '[a]' in g:
            run('ffmpeg', '-y', '-filter_complex', g, '-ar', '48000', '-ac', '2', p)
        else:
            run('ffmpeg', '-y', '-f', 'lavfi', '-i', g, '-ar', '48000', '-ac', '2', p)

ins, flt = ['-i', video, '-i', MUSIC], []
music_vol = 0.32 if VO else 0.8
flt.append(f'[1:a]atrim=0:{T:.3f},afade=t=out:st={T - 1.5:.3f}:d=1.5,volume={music_vol}[m]')
mix = ['[m]']
n = 2
if VO:
    ins += ['-i', VO]
    at = int((VO_AT if '--voiced' in sys.argv else 0) * 1000)
    flt.append(f'[{n}:a]aresample=48000,aformat=channel_layouts=stereo,adelay={at}|{at},asplit=2[vo][vo2]')
    # Duck the music under the voice.
    flt[0] = flt[0].replace('[m]', '[m0]')
    flt.append('[m0][vo]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=300[m]')
    mix.append('[vo2]')
    n += 1
for j, (kind, at) in enumerate(sfx):
    ins += ['-i', os.path.join(D, f'sfx-{kind}.wav')]
    flt.append(f'[{n}:a]adelay={int(at * 1000)}|{int(at * 1000)},volume=0.6[s{j}]')
    mix.append(f'[s{j}]')
    n += 1
flt.append(f"{''.join(mix)}amix=inputs={len(mix)}:normalize=0,loudnorm=I=-14:TP=-1.0:LRA=9,aresample=48000[aout]")
outp = os.path.join(D, f'verse-arcade-{PRE}.mp4')
run('ffmpeg', '-y', *ins, '-filter_complex', ';'.join(flt), '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
    '-t', f'{T:.3f}', '-movflags', '+faststart', outp)
open(os.path.join(D, f'timing-{PRE}.txt'), 'w').write('\n'.join(sheet) + f'\n\nTotal {T:.1f}s\n')
print('\n'.join(sheet)); print(f'Total {T:.1f}s -> {outp}')
