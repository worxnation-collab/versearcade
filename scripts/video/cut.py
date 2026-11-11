#!/usr/bin/env python3
"""Cut the recorded shots (record.mjs) into one silent vertical promo.

    python3 scripts/video/cut.py <dir>     # writes <dir>/verse-arcade-promo.mp4 + timing.txt

Each segment is (shot, start, end, caption). Captions sit in a band over the
bottom nav, where they cover nothing a viewer needs; the voice goes on later.
"""
import os, subprocess, sys

D = sys.argv[1]
FONT = '/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf'
# (shot, start, end, caption[, hold]) — timed to the owner's second voiceover
# (2026-11-11, lead 3.3s). `hold` freezes the segment's last frame for that
# many extra seconds, so a shot can wait for the line spoken over it.
SEGS = [
    ('verse', 0.0, 2.0, 'One verse a day.\nThe same one for everybody.'),
    ('verse', 2.0, 5.0, 'Read it once…'),
    ('verse', 6.0, 8.3, '…then five quick questions.'),
    ('verse', 17.0, 20.5, 'Who said it? Who to?\nWhat came before?'),
    ('verse', 10.4, 15.0, 'Get one wrong?\nIt tells you why.'),
    ('verse', 15.0, 16.6, 'Wrong answers teach.'),
    ('verse', 26.6, 31.6, 'Nobody ranked against friends.\nYou race yourself.'),
    ('trivia', 0.5, 4.7, 'A trivia round on one book\nof the Bible, every day.'),
    ('arcade', 0.0, 1.4, 'A little arcade…'),
    ('arcade', 3.6, 8.0, 'Manna Rush: gather six days,\nrest on the seventh.'),
    ('character', 0.4, 4.6, 'Build your own character.'),
    ('character', 8.0, 12.0, 'Earn the fancier pieces\nby playing.'),
    ('church', 0.0, 4.0, "Your church can share the\nsermon's verse all week."),
    ('end', 0.0, 5.0, None),
]


def esc(t):
    return t.replace('\\', '\\\\').replace(':', '\\:').replace("'", '’').replace('%', '\\%')


def run(*a):
    subprocess.run(a, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


parts, t, sheet = [], 0.0, []
for i, (shot, a, b, cap, *rest) in enumerate(SEGS):
    hold = rest[0] if rest else 0
    out = os.path.join(D, f'seg{i:02d}.mp4')
    vf = 'fps=30,scale=1080:1920,format=yuv420p' + (f',tpad=stop_mode=clone:stop_duration={hold}' if hold else '')
    if cap and os.environ.get('CAPTIONS', '1') != '0':
        lines = cap.split('\n')
        h = 70 + 64 * len(lines)
        vf += f',drawbox=x=0:y={1920 - h - 120}:w=1080:h={h}:color=black@0.62:t=fill'
        for k, line in enumerate(lines):
            y = 1920 - h - 120 + 35 + 64 * k
            vf += (f",drawtext=fontfile={FONT}:text='{esc(line)}':fontcolor=white:fontsize=50"
                   f":x=(w-text_w)/2:y={y}:shadowcolor=black@0.6:shadowx=2:shadowy=2")
    if shot == 'end':
        src = os.path.join(D, 'end', 'f00000.jpg')
        run('ffmpeg', '-y', '-loop', '1', '-t', str(b - a), '-i', src, '-vf', vf, '-c:v', 'libx264', '-crf', '18', '-preset', 'fast', '-r', '30', out)
    else:
        run('ffmpeg', '-y', '-ss', str(a), '-to', str(b), '-i', os.path.join(D, shot + '.mp4'), '-vf', vf,
            '-c:v', 'libx264', '-crf', '18', '-preset', 'fast', '-r', '30', out)
    parts.append(out)
    sheet.append(f'{t:5.1f}s – {t + b - a + hold:5.1f}s  {shot:<9} {(cap or "END CARD: versearcade.org").replace(chr(10), " ")}')
    t += b - a + hold

lst = os.path.join(D, 'parts.txt')
open(lst, 'w').write(''.join(f"file '{p}'\n" for p in parts))
final = os.path.join(D, 'verse-arcade-promo.mp4')
run('ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', '-movflags', '+faststart', final)
# Voiceover: `python3 cut.py <dir> <voice> [lead]` lays the recording under the
# cut, dropping `lead` seconds of silence off its front, cleaned and levelled.
if len(sys.argv) > 2:
    lead = sys.argv[3] if len(sys.argv) > 3 else '0'
    voiced = os.path.join(D, 'verse-arcade-promo-voiced.mp4')
    run('ffmpeg', '-y', '-i', final, '-ss', lead, '-i', sys.argv[2], '-map', '0:v', '-map', '1:a',
        '-af', 'highpass=f=80,afftdn=nf=-25,loudnorm=I=-14:TP=-1.5:LRA=11,apad',
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', voiced)
    print('voiced ->', voiced)
open(os.path.join(D, 'timing.txt'), 'w').write('\n'.join(sheet) + f'\n\nTotal {t:.1f}s\n')
print('\n'.join(sheet)); print(f'total {t:.1f}s ->', final)
