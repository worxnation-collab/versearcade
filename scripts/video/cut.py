#!/usr/bin/env python3
"""Cut the recorded shots (record.mjs) into one silent vertical promo.

    python3 scripts/video/cut.py <dir>     # writes <dir>/verse-arcade-promo.mp4 + timing.txt

Each segment is (shot, start, end, caption). Captions sit in a band over the
bottom nav, where they cover nothing a viewer needs; the voice goes on later.
"""
import os, subprocess, sys

D = sys.argv[1]
FONT = '/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf'
SEGS = [
    ('verse', 0.0, 2.0, 'One verse a day.\nThe same one for everybody.'),
    ('verse', 2.2, 5.5, 'Read it once…'),
    ('verse', 6.0, 10.0, '…then five quick questions.'),
    ('verse', 10.5, 16.0, 'Get one wrong?\nIt tells you why.'),
    ('verse', 18.2, 20.0, 'Wrong answers teach.'),
    ('verse', 26.0, 30.5, 'Nobody ranked against friends.\nYou race yourself.'),
    ('verse', 30.5, 34.6, 'You learn something\neither way.'),
    ('trivia', 0.5, 2.5, 'A trivia round on one book\nof the Bible, every day.'),
    ('trivia', 3.5, 5.6, 'A trivia round on one book\nof the Bible, every day.'),
    ('arcade', 0.0, 2.4, 'A little arcade.'),
    ('arcade', 3.6, 11.0, 'Manna Rush: gather today,\nrest on the seventh.'),
    ('character', 0.4, 14.8, 'Make your own character.'),
    ('church', 0.0, 4.8, "Your church can put the sermon's\nverse in front of everyone all week."),
    ('end', 0.0, 5.0, None),
]


def esc(t):
    return t.replace('\\', '\\\\').replace(':', '\\:').replace("'", '’').replace('%', '\\%')


def run(*a):
    subprocess.run(a, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


parts, t, sheet = [], 0.0, []
for i, (shot, a, b, cap) in enumerate(SEGS):
    out = os.path.join(D, f'seg{i:02d}.mp4')
    vf = 'fps=30,scale=1080:1920,format=yuv420p'
    if cap:
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
    sheet.append(f'{t:5.1f}s – {t + b - a:5.1f}s  {shot:<9} {(cap or "END CARD: versearcade.org").replace(chr(10), " ")}')
    t += b - a

lst = os.path.join(D, 'parts.txt')
open(lst, 'w').write(''.join(f"file '{p}'\n" for p in parts))
final = os.path.join(D, 'verse-arcade-promo.mp4')
run('ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', '-movflags', '+faststart', final)
open(os.path.join(D, 'timing.txt'), 'w').write('\n'.join(sheet) + f'\n\nTotal {t:.1f}s\n')
print('\n'.join(sheet)); print(f'total {t:.1f}s ->', final)
