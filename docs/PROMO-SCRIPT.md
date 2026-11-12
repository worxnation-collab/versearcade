# The fun promo: script to record

About 48 seconds, cut by `scripts/video/cut2.py` from the real app (`scripts/video/record.mjs`).
Read it **fast and smiling**, like you're letting a friend in on something. Little pauses are fine;
the edit is retimed to your recording afterwards. Record it in one take on your phone, quiet room,
phone 6 inches from your mouth.

| Time | On screen | You say |
|---|---|---|
| 0:00 | Wheat field moving. POP QUIZ | "Pop quiz! Finish the verse: *Seek first the kingdom of God and…*" |
| 0:03 | 3 · 2 · 1 | "Three… two… one!" |
| 0:04 | The answer goes green | "*His righteousness!* Did you get it?" |
| 0:07 | "This is Verse Arcade" | "This is Verse Arcade." |
| 0:08 | The verse card | "One verse a day — the same one for everybody." |
| 0:10 | First question, confetti | "Read it, then five quick questions." |
| 0:12 | Wrong answer, buzz | "Get one wrong?" |
| 0:13 | "Good to know" card | "It tells you *why*. Wrong answers teach — that's the whole trick." |
| 0:16 | Combo racing up | "Build a combo…" |
| 0:18 | 903, streak | "…keep your streak alive." |
| 0:21 | Recap | "And nobody's ranked against their friends. You only race yourself." |
| 0:23 | Trivia | "There's daily Bible trivia…" |
| 0:25 | Manna Rush | "…an arcade — yes, you're catching manna —" |
| 0:29 | Character | "…and you build your own character. Hoodie optional." |
| 0:32 | PASTORS | "Pastors! This one's for you." |
| 0:33 | Typing John 15:5 | "Type in Sunday's verse…" |
| 0:36 | Questions appear | "…it writes the five questions for you…" |
| 0:39 | Play it as your congregation | "…and your whole church plays your sermon all week." |
| 0:42 | People list | "You can even see who's playing." |
| 0:44 | End card | "It's free. Play today's verse at versearcade dot org." |

## Then

Send the recording (any format). It gets dropped into the cut with
`python3 scripts/video/cut2.py <dir> --vo your-take.wav`: the music ducks under your voice and the
segments are nudged to your timing. Speeding the voice up 5-10% is fine and usually sounds better
for a Short; pitch is kept.

## What the cut does

- Cold open on a living painting (the wheat-field clip from `art/living.json`), a pop quiz and a
  3-2-1 tick, then the answer landing in the real app.
- Speed ramps (1.5-2.5x) through anything that is just waiting; punch-in zooms on the moment that
  matters (the wrong answer's "Good to know", the streak).
- Big captions on solid pills, a ding on every right answer, a buzz on the wrong one, a whoosh on
  section changes, all synthesised in the script.
- An upbeat instrumental bed made with fal (ElevenLabs Music, 56s, instrumental), at
  `music.mp3` in the recording folder.
