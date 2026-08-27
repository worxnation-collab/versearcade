# App Store listing — copy & answers (ready to paste)

Everything App Store Connect asks for, pre-written. Paste each field into the
matching box. Character limits are Apple's; these are already within them.

Bundle ID: **com.versearcade.app** · SKU suggestion: **versearcade-ios-001**
Primary category: **Education** · Secondary: **Lifestyle**
Age rating: **12+** (NOT the Kids Category — see SUBMISSION runbook §Age).

---

## Name (max 30 chars)
```
Verse Arcade
```

## Subtitle (max 30 chars)
```
Daily Bible verse game
```
> Alt options if the above feels off: `Learn the Bible, one drop a day` is 31 (too long).
> `Bible trivia, made a game` (25). `The daily Bible challenge` (25).

## Promotional text (max 170 chars — editable anytime without review)
```
One verse a day. Race the clock, keep your streak, battle a friend, and play for your church. No shame, no pop quiz energy — miss one and you still learn something.
```

## Description (max 4000 chars)
```
Open the Bible and actually want to. Verse Arcade turns Scripture into a fast, friendly daily game.

THE DAILY DROP
Every day, one verse goes live for everyone at the same time — your shared ritual. Read it, then race the clock through five quick questions about that exact verse: which book it's from, who's speaking, who's being addressed, what happens next. Answer fast and accurately to rack up points.

YOU CAN'T LOSE, ONLY LEARN
Miss a question? No buzzer, no shame. A wrong answer reveals a genuinely interesting fact about the verse, so you walk away knowing more than you did a second ago. This app is built for people who feel behind — nobody starts knowing every verse.

BUILD A STREAK YOU'LL WANT TO KEEP
Earn XP, level up, and grow a daily streak with a flame that gets hotter the longer you go. Busy day? A streak freeze quietly saves you, so real life doesn't punish you.

BATTLE A FRIEND
Challenge someone to the same verse quiz and see who scores higher — or race a study partner whose score ticks up live beside yours. Pick Rookie, Deacon or Prophet.

PLAY FOR YOUR CHURCH
Find your church, then give it the points you earn. Giving costs you nothing — your own XP and rank stay exactly where they are — and your congregation levels up and climbs the board. Can't find yours? Add it in seconds.

STUDY WHAT YOU'RE ACTUALLY WEAK AT
See your accuracy book by book, weakest first, and drill the ones that need it. Keep the verses that mattered with Favorites, review them before they fade, and read the whole chapter in KJV, WEB or BBE.

BUILD A CHARACTER
Piece together the Armor of God, collect relics from the daily chest, and earn full-look skins by showing up and sharing. Earned skins are earned — a missed day never takes one away.

GENTLE REMINDERS
Turn on a nudge for the daily verse and it'll tell you which verse is waiting, even offline. Study reminders only arrive on days you actually have something to review.

MADE THOUGHTFULLY
- Play instantly as a guest — no account required.
- Sign in with Apple, Google, or email to sync your streak across devices.
- Sound and haptics you can dial down or off anytime.
- Delete your account and all data in-app, whenever you want.
- No ads. No tracking. We never sell your data.

Verse text uses the Berean Standard Bible (BSB), a modern, public-domain translation. Scripture is always free — and always will be.

Start your streak today. It's one verse.
```

## Keywords (max 100 chars, comma-separated, no spaces)
```
bible,verse,scripture,daily,trivia,christian,faith,devotional,quiz,streak,church,battle,study,god
```

## Support URL
```
https://versearcade.org/support.html
```

## Marketing URL (optional)
```
https://versearcade.org
```

## Privacy Policy URL (required)
```
https://versearcade.org/privacy.html
```

> These URLs go live the moment DNS points versearcade.org at Netlify. Until then,
> you may substitute https://verse-arcade.netlify.app/privacy.html and /support.html
> — they already work today.

---

## App Privacy questionnaire (App Store Connect → App Privacy)

Answer the "nutrition label" like this. Verse Arcade does **not** track, so there is
no "Used to Track You" bucket.

| Data type | Collected? | Linked to identity? | Used for tracking? | Purpose |
|-----------|-----------|---------------------|--------------------|---------|
| Email address | Yes (only if account created) | Linked | No | App Functionality, Account |
| Name (display name) | Yes | Linked | No | App Functionality |
| User ID | Yes | Linked | No | App Functionality |
| Gameplay content (scores/streak/answers) | Yes | Linked | No | App Functionality |
| Everything else (location, contacts, photos, health, financial, browsing, ads) | No | — | — | — |

- Guest users: no data collected — but App Store Connect asks about the app as a whole,
  so answer "Yes" for the types above (they apply when a user signs up).
- **Data Used to Track You:** None.
- **Data Linked to You:** Email, Name, User ID, Gameplay content.
- **Data Not Linked to You:** None (or Diagnostics if you later add crash reporting).

---

## Age rating questionnaire → results in **12+**
Answer "None" to every content question (violence, sexual content, profanity, gambling,
etc.). The only nuance: **"Unrestricted Web Access" = No** (the app has no open browser),
and there is **no** user-generated content shared publicly (group names are the only
free text, visible only within a private group — keep the answer honest; if Apple's
form asks about UGC, "Infrequent/Mild" at most). This lands at 12+ / 9+; either is fine.

> Do NOT check "Made for Kids." That opts you into the Kids Category and COPPA rules.

---

## Review notes (App Information → Notes for reviewer)
```
Verse Arcade is a Bible-learning game. No account is required — tap "Play today's verse"
on the home screen to play immediately as a guest, which exercises the full core loop.

To test account features and Sign in with Apple, you can create a throwaway account, or
use this demo account:
  Email: [FILL IN — create one before submitting]
  Password: [FILL IN]

There are no paid features in this version, so no in-app purchases to test.
Account deletion: Profile tab → "Delete my account".
Sound/haptics can be toggled in Settings.
```

## Demo account (create before submitting)
Reviewers must be able to reach every feature. Since guest play covers the core loop,
a demo account is optional but recommended so they can see synced/account state.
Create one real account in the app, then paste its credentials into the review notes above.

---

## Screenshots (required)
Apple requires screenshots for at least the **6.7" iPhone** display (1290 × 2796).
As of the current App Store Connect, a 6.7"/6.9" set is sufficient (iPad only if you
mark the app iPad-compatible — recommend iPhone-only for v1).

Minimum 3, up to 10. Recommended shots, in order:
1. The Daily Drop / verse read screen ("A new verse is live").
2. A question mid-play with the combo meter and points.
3. A correct-answer celebration (confetti + points pop).
4. A wrong-answer "did you know" teach reveal (shows the no-shame promise).
5. The profile with streak flame + XP/level.
6. Groups ("Play with friends, climb together").

See SUBMISSION runbook for how to capture these without a Mac.
