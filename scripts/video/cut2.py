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


def run(*a):
    subprocess.run(a, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def esc(t):
    return t.replace('\\', '\\\\').replace(':', '\\:').replace("'", '’').replace('%', '\\%').replace(',', '\\,')


def src_of(name):
    if name == 'open':
        return OPEN
    return os.path.join(D, name + '.mp4')


# The pastor card: a bold title over a blurred frame of the demo.
card = os.path.join(D, 'card.mp4')
if not os.path.exists(card):
    run('ffmpeg', '-y', '-ss', '2', '-i', os.path.join(D, 'pastor.mp4'), '-frames:v', '1', '-vf', 'gblur=sigma=30,eq=brightness=-0.25', os.path.join(D, 'card.png'))
    run('ffmpeg', '-y', '-loop', '1', '-t', '2', '-i', os.path.join(D, 'card.png'), '-vf', 'fps=30,scale=1080:1920,format=yuv420p', '-c:v', 'libx264', '-crf', '18', card)
end = os.path.join(D, 'end.mp4')
if not os.path.exists(end):
    run('ffmpeg', '-y', '-loop', '1', '-t', '5', '-i', os.path.join(D, 'end', 'f00000.jpg'), '-vf', 'fps=30,scale=1080:1920,format=yuv420p', '-c:v', 'libx264', '-crf', '18', end)

parts, sfx, sheet, T = [], [], [], 0.0
for i, (name, a, b, sp, zoom, caps, fx) in enumerate(SEGS):
    dur = (b - a) / sp
    vf = [f'setpts=(PTS-STARTPTS)/{sp}', 'fps=30', 'scale=1080:1920:force_original_aspect_ratio=increase', 'crop=1080:1920']
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
    out = os.path.join(D, f'fun{i:02d}.mp4')
    run('ffmpeg', '-y', '-ss', str(a), '-t', str(b - a), '-i', src_of(name), '-an', '-vf', ','.join(vf),
        '-t', f'{dur:.3f}', '-c:v', 'libx264', '-crf', '18', '-preset', 'fast', '-r', '30', out)
    parts.append(out)
    for kind, st in fx:
        sfx.append((kind, T + max(0.0, (st - a) / sp)))
    sheet.append(f"{T:5.1f}s – {T + dur:5.1f}s  {name:<9} {' / '.join(c[0] for c in caps) or '—'}")
    T += dur

lst = os.path.join(D, 'fun-parts.txt')
open(lst, 'w').write(''.join(f"file '{p}'\n" for p in parts))
video = os.path.join(D, 'fun-video.mp4')
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
    flt.append(f'[{n}:a]volume=1.6[vo]')
    # Duck the music under the voice.
    flt[0] = flt[0].replace('[m]', '[m0]')
    flt.append('[m0][vo]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=300[m]')
    flt.append(f'[{n}:a]volume=1.6[vo2]')
    mix.append('[vo2]')
    n += 1
for j, (kind, at) in enumerate(sfx):
    ins += ['-i', os.path.join(D, f'sfx-{kind}.wav')]
    flt.append(f'[{n}:a]adelay={int(at * 1000)}|{int(at * 1000)}[s{j}]')
    mix.append(f'[s{j}]')
    n += 1
flt.append(f"{''.join(mix)}amix=inputs={len(mix)}:normalize=0,alimiter=limit=0.9[aout]")
outp = os.path.join(D, 'verse-arcade-fun.mp4')
run('ffmpeg', '-y', *ins, '-filter_complex', ';'.join(flt), '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
    '-t', f'{T:.3f}', '-movflags', '+faststart', outp)
open(os.path.join(D, 'timing-fun.txt'), 'w').write('\n'.join(sheet) + f'\n\nTotal {T:.1f}s\n')
print('\n'.join(sheet)); print(f'Total {T:.1f}s -> {outp}')
