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

---

# The long walkthrough (about 3 minutes)

`python3 scripts/video/cut2.py <dir> --long --music music-long.mp3`: the same grammar, slower,
with a chapter card before each part of the app. This is the long-form video every Short's
**Related video** points at (`docs/YOUTUBE-FUNNEL.md`), so it has to be over 60 seconds and should
end on the link. The picture runs 2:23 on its own; your voice at a relaxed pace takes it to about
three minutes and the shots are stretched to your timing.

Read it like you're showing a friend, not presenting. Smile on the jokes.

**Cold open**
> Pop quiz! Finish the verse: *Seek first the kingdom of God and…* Three… two… one… *His
> righteousness!* Did you get it? Don't worry — most people don't on the first try.

**The daily verse**
> This is Verse Arcade. Every day there's one verse — the same one for everybody, everywhere.
> You read it once, then the clock starts and you get five quick questions about it. Who said it?
> Who were they talking to? What comes right after?
> And if you get one wrong — *(buzz)* — it doesn't just say "wrong." It tells you why. That's the
> whole idea: wrong answers teach. You leave knowing something you didn't.
> Get a few right in a row and you build a combo… keep coming back and you build a streak. And at
> the end it hands you back the verse and everything you learned today.

**Trivia**
> There's also a trivia round every day — five questions about one book of the Bible. Today it's
> Matthew. Tomorrow, who knows. Obadiah, maybe. Good luck.

**Battle**
> Want a little competition? Race the computer. Pick Rookie, Deacon or Prophet, and go head to
> head on the same verse. Fair warning: Prophet is *fast*. Win or lose, you still learn something.

**Your Bible**
> All sixty-six books are in here. Every chapter you open gets marked, so you can see your own
> Bible fill in over time. Finish a whole book and you press its seal. Nobody else sees this —
> it's just yours.

**Study**
> In the Study tab, Tabitha the librarian lends you something new every day, and your progress
> shows how you're doing against… you. Nobody else. No rankings in here, ever.

**The arcade**
> And then there's the arcade. Three little games. Manna Rush — gather manna for six days, and on
> the seventh, rest. Word Catch, where today's verse falls apart and you put it back together.
> And the Cross Word: two words, one shared letter… and when you finish, it turns into wood.

**Make it yours**
> Build your own character — hair, clothes, the works. Hoodie optional. You get your own room,
> and there's a whole wardrobe of things you earn by playing — never by paying. Your journal keeps
> track of every milestone you pass.

**Pastors**
> Okay, pastors — this part is for you. Type in the verse you're preaching on Sunday. Verse Arcade
> writes the five questions for you, and you can edit every one. Hit set… and now your whole church
> plays your sermon all week long. You can see who's playing, plan a whole series, and see how it
> lands with your people.

**The end**
> It's free. Play today's verse at versearcade dot org — the link is right under this video.
> And hey… seek first the kingdom. See you tomorrow.
