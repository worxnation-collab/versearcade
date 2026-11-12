#!/usr/bin/env python3
"""Make a recording of the owner's voice sound produced: the promo chain, as a tool.

    python3 scripts/video/voice.py <in> [out] [--tighten] [--lufs -14]

<in> may be audio (m4a, mp3, wav…) or a VIDEO (mov, mp4…). Audio comes back as
a cleaned WAV; a video comes back as the same video with the cleaned voice put
back on it, picture untouched (`<name>-clean.mp4`).

The chain, the one used on the 2026-11-12 walkthrough (docs/PROMO-SCRIPT.md):
  1. noise removal: fal `fal-ai/deepfilternet3` (about $0.001 per second; the
     fal key is the proxy-injected secret, or FAL_KEY on a laptop);
  2. rumble cut, mud down, presence and air up, sibilance tamed, level evened;
  3. loudness to -14 LUFS / -1 dBTP, the target YouTube, Instagram and TikTok
     normalise to.

`--tighten` also shortens long pauses and speeds up 4% (pitch kept). It moves
every word, so it is OFF for a video (the lips would stop matching) and only
for a voiceover the picture is cut to afterwards.
"""
import base64, json, os, subprocess, sys, tempfile, time

args = [a for a in sys.argv[1:] if not a.startswith('--')]
if not args:
    sys.exit(__doc__)
src = args[0]
flag = lambda k: k in sys.argv
val = lambda k, d: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d
LUFS = float(val('--lufs', '-14'))
TIGHTEN = flag('--tighten')
KEY = 'Authorization: Key ' + (os.environ.get('FAL_KEY') or 'proxy')

def run(*a):
    subprocess.run(a, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)

def has_video(p):
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=codec_type',
                          '-of', 'csv=p=0', p], capture_output=True, text=True).stdout
    return 'video' in out

def curl(url, body_file=None):
    a = ['curl', '-sS', '--fail-with-body', '-H', KEY, url]
    if body_file:
        a += ['-H', 'Content-Type: application/json', '--data-binary', '@' + body_file]
    return json.loads(subprocess.run(a, check=True, capture_output=True, text=True).stdout)

video = has_video(src)
if TIGHTEN and video:
    sys.exit('--tighten would put the voice out of sync with the picture; leave it off for a video.')
base = os.path.splitext(src)[0]
out = args[1] if len(args) > 1 else base + ('-clean.mp4' if video else '-clean.wav')

with tempfile.TemporaryDirectory() as T:
    flac = os.path.join(T, 'in.flac')
    run('ffmpeg', '-y', '-i', src, '-vn', '-ac', '1', '-ar', '48000', flac)
    body = os.path.join(T, 'body.json')
    with open(flac, 'rb') as f:
        json.dump({'audio_url': 'data:audio/flac;base64,' + base64.b64encode(f.read()).decode(), 'audio_format': 'wav'}, open(body, 'w'))
    sub = curl('https://queue.fal.run/fal-ai/deepfilternet3', body)
    for _ in range(300):
        if curl(sub['status_url']).get('status') == 'COMPLETED':
            break
        time.sleep(3)
    clean = os.path.join(T, 'clean.wav')
    run('curl', '-sS', '--fail', '-o', clean, curl(sub['response_url'])['audio_file']['url'])
    chain = ('highpass=f=80,equalizer=f=220:t=q:w=1:g=-2.5,equalizer=f=3200:t=q:w=1.2:g=3,'
             'highshelf=f=9000:g=2.5,deesser=i=0.35,'
             'acompressor=threshold=-22dB:ratio=3:attack=8:release=160:makeup=3dB')
    if TIGHTEN:
        chain += ',silenceremove=stop_periods=-1:stop_duration=0.4:stop_threshold=-48dB:stop_silence=0.32,atempo=1.04'
    chain += f',loudnorm=I={LUFS}:TP=-1.0:LRA=7,aresample=48000'
    if video:
        run('ffmpeg', '-y', '-i', src, '-i', clean, '-filter_complex', f'[1:a]{chain}[a]', '-map', '0:v', '-map', '[a]',
            '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out)
    else:
        run('ffmpeg', '-y', '-i', clean, '-af', chain, '-ac', '1', out)
print(out)
