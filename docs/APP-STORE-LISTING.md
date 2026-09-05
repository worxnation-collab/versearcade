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
See your accuracy book by book, weakest first, and drill the ones that need it. Keep the verses that mattered, review them before they fade, and read the whole chapter in KJV, WEB or BBE. Nothing in Study is ranked or scored against anyone.

YOUR WHOLE BIBLE, FILLING IN
All 66 books, 1,189 chapters and 31,102 verses are in here, and every one you read, study or keep lights up on your own copy. Open a chapter with no signal and it still draws every verse. Most of the Bible isn't in the daily rotation, and the reader says so plainly — it's there to read, not to grade you.

MAKE A CHARACTER, AND FURNISH A WORLD
Build yourself at the door, then earn full-look skins and a companion by showing up. Your faction's keep grows with the battles you play — decorate the hall, plant the churchyard, and offer your finest piece to your congregation. Earned is earned: a missed day never takes one away.

WASH SOMEBODY'S FEET
Every other way to act on a player here is a challenge. This one isn't. Tap someone's face, kneel, and they'll see it — twelve a day, one for each disciple. There is no score for being washed and no way to see anyone's total but your own.

A SOUNDTRACK THAT UNLOCKS BY WALKING IN
Every room has its own instrumental, and hearing one for the first time adds it to your music player. You can't miss one, and there's nothing to buy.

GENTLE REMINDERS
Turn on a nudge for the daily verse and it'll tell you which verse is waiting, even offline. Study reminders only arrive on days you actually have something to review.

MADE THOUGHTFULLY
- Play today's verse as a guest. A free account opens the rest and keeps your streak.
- Sign in with Apple, Google, or email to sync your streak across devices.
- Sound and haptics you can dial down or off anytime.
- Delete your account and all data in-app, whenever you want.
- No ads. No tracking. We never sell your data.

Verse text uses the Berean Standard Bible (BSB), a modern, public-domain translation. Scripture is always free — and always will be.

Start your streak today. It's one verse.
```

## What's New (max 4000 chars — per version, App Store Connect asks for this)

### 1.3.0 — the release after 1.2.0 (NEXT, unuploaded — RUNNING DRAFT)

> 1.3.0's train is open and features are still landing under that number, so this
> block is **not final**. Add to it as things merge, and re-read it against `git log`
> on the day you submit. Do not bump the version for a new feature — only an
> *approved* version forces a bump.
>
> Last rebuilt against `git log --first-parent` on 2026-09-01, covering #157 to the
> daily drop dropping its bonus question. **3,914 characters against Apple's
> 4,000 limit.**
>
> Two revisions ago this block was at the wall with nothing left to shave, and the
> rule since has been that the next feature TAKES SOMETHING OUT. Bonus trivia paid
> by deleting `THE STUDY TAB IS A LIBRARY` (it appears near-verbatim in 1.2.0's
> shipped notes below, checked line by line rather than taken on trust), the
> `every church building is painted` bullet, and its own `every answer teaches`
> line, which the BATTLE section already says.
>
> The Play-tab redesign paid the same way. It also **corrected a line that would
> have shipped false**: the arcade bullet said a cabinet sits "on the home screen
> once today's verse is done", and that card is gone — the arcade is a row on the
> compass now. What came out to make room: `Once a run starts, it runs`, the only
> bullet here announcing a RESTRICTION rather than a thing you get, and the
> statues-move nuance, which is a sub-case of the drag bullet above it.
>
> The daily drop's bonus trivia question was then REMOVED, so the bullet claiming
> "the last question of every run is now a bonus about the BOOK" would have
> shipped false — corrected, and the section renamed to what trivia actually is
> now (rounds of its own, and a battle mode). That is the second false line this
> block has been caught carrying in a day; both were found by re-reading it
> against the change rather than by anything automatic, and nothing in CI checks
> it.
>
> **The founding-patron skin swap (whale → Cephas) deliberately took NO space
> here, and that is a judgement rather than an oversight.** What's New is for
> what a player can now DO, and nothing they do changed: the app's one product
> costs the same $9.99, buys the same kind of thing (a look — now a skin plus the
> Cornerstone card background), and every existing patron keeps the whale and is
> given the rock. There is no bullet worth 200 characters of a 4,000-character
> budget in "the optional thank-you looks different". Two things it DOES need,
> neither of them here: migration `0095` applied before this merges, and the IAP's
> display name in App Store Connect read (and, if it names the whale, changed to
> "Founding Patron" — a metadata edit that goes to review while the approved
> version stays on sale, so there is no gap).
>
> 86 characters of headroom is not a reprieve — the next feature is in exactly the
> same position. The remaining honest cuts are **live battles** and **the weekly
> church rivalry**, if the check below shows they shipped in 1.2.0 already. That
> check is owed before submission regardless, and it is the only thing that will
> make real room.
>
> **"Watch yesterday's verse" deliberately takes NO space here**, the same
> judgement the patron swap got. It is a row of links to the TikTok account's
> video of yesterday's verse, shown on the result screen only when there is a
> published video to point at — so it is not something a player can reliably DO,
> and a bullet promising it would be false on any day the row is empty. It costs
> nothing here, and nothing in App Store Connect either.
>
> **The Prayer Wall landed after the 3,914-character count above** (leave a note,
> the wall deals you somebody else's, hold a candle for it; migration `0099`). It
> is exactly the kind of thing What's New exists to say and there is no room for
> it until the cut above is made — so the cut is no longer optional. Suggested
> bullet, ~190 characters: "THE PRAYER WALL · Leave a note — a kind of thing,
> a line if you want, signed or not. The wall hands you somebody else's; hold the
> candle for them. When theirs is answered, you're told."

```
BIBLE TRIVIA, A ROUND AT A TIME
• Four hundred questions about the BOOKS of the Bible — their people, their
  places, what happens in them — across all sixty-six.
• A whole round of it now sits beside today's verse: five questions on one book,
  the same book for everyone, new each morning. Tabitha lends more on any book
  you pick. No XP, no rank, nothing to fall behind on.

BATTLE ANYONE, RIGHT NOW
• Quick match: tap it and we'll put you with whoever else is looking. No code, no
  queue position, no rating — whoever's there is who you get.
• Or share a room code. Either way you both read the same verse, you both tap
  ready, and a bar shows where the other player is the whole way down.
• Pick what kind of round you're battling: the verse, or trivia on one book.
• Battles pay 10 XP for turning up, three a day — winner and loser get exactly
  the same, because what's rewarded is playing, not beating anybody.
• Six new looks earned in battle. Jonathan and Deborah come from playing live,
  win or lose; Francis of Assisi, Hildegard of Bingen, Thomas Aquinas and
  Melisende of Jerusalem from winning. You're told the moment one is yours — no
  progress bar to grind, and nothing anywhere counts what you've lost.
• Wrong answers still teach. The line explaining one is yours to read at your own
  pace, even if it costs you the round.

THERE'S AN ARCADE IN HERE NOW
• A cabinet in your own room, and a row on the compass whenever you want one.
• Manna Rush: seven days in the wilderness. Gather the fresh flakes, leave
  yesterday's, and on the seventh day the best thing to do is rest.
• Word Catch: a verse comes loose from the page and you tap the words back into
  order. Play again and a different one comes apart.
• Cross Word: two words that share a letter, standing as a cross. Solve it and the
  squares turn to wood with the verse carved underneath. A fresh cut every time.
• Your first go on each machine is worth 5 XP a day — for turning up, not for doing
  well. No high scores, and nothing in here can be lost.
• Send a friend a machine: a shared link is one free go, no account or download.

FIRST LIGHT: THE DAY BELONGS TO WHOEVER OPENS IT
• The first person to open a day's verse holds its first light, and everyone who
  opens it after them is worth a point of XP to them. Nothing is taken from
  anybody — the points are minted, not moved.
• No second place, no leaderboard of who was quickest, and a fresh start at
  midnight.

YOUR CHURCH HAS SOMEBODY TO PLAY THIS WEEK
• Every Monday your church is matched against another its own size. Whoever gives
  more raises a statue in their churchyard, and your congregation picks which one.
  Nobody is named on the losing side, and Monday starts everyone at nothing.
• Small congregations play other small congregations, so a church of four can
  actually win its week.
• The board reads Today, This week or All time, so a church playing hard now
  isn't buried under one that banked its points two years ago and went quiet.
• Churches near you are suggested before you type a thing, and a verified leader
  can keep their own church's page up to date.

ARRANGE EVERYTHING WITH YOUR THUMB
• Pick up anything in your Upper Room, your keep's hall or your churchyard and
  drag it where you like. Rugs stay on floors, banners on walls, plants on grass,
  and nothing you place is ever lost or overwritten.
• A plant at the front of the lawn is nearer, so it's bigger. Drag it back toward
  the church and it settles into the distance.
• Finer furnishings are their own rewards now: you earn Fine and Grand by playing
  instead of stacking duplicates, and a lesser copy upgrades where it stands.

FIND ANYTHING IN ONE TAP
• The Play tab is today's verse, today's trivia and your road. Nothing else.
• A compass under them maps everywhere in the app and lights up while something
  is open. Never a score, never a list of what you missed.
```

**Three sections here may already be in players' hands, and the repo cannot settle
it.** `1.2.0 is live: close its train` (#158) landed *after* the weekly rivalry
(#157) and live battles (#156), and the Study library (#169) landed after it — so
the merge order says one thing and the 1.2.0 release notes below, which describe
the library as shipped, say another. A binary is cut before it is approved, and
only App Store Connect knows what was in it.

So before submitting: open the uploaded 1.2.0 build and check whether **live
battles**, **the weekly church rivalry** and **the Study library** are in it. Cut
whatever is — announcing a feature the store already showed people is worse than a
short release note. Everything else in the block above merged well after 1.2.0 was
live and is safe.

### 1.2.0 — the release after 1.1.0 (SHIPPED, approved and live)
```
Your whole Bible is in here now — all 66 books and 31,102 verses — and every one you
read, study or keep lights up on your own copy.

PLACES THAT ARE YOURS
• The Upper Room: a small chamber under your player card that belongs to nobody but
  you. Eighteen furnishings, earned by playing. Friends can knock and look around —
  and there is no number on it for anyone to beat.
• Pray in it. A prayer is built for you out of four movements, so you always know what
  comes next, and it will read itself aloud in a calm voice if you'd rather listen.
  Your lampstand burns on the day you prayed and goes out overnight. It is not a
  streak, and nothing counts it.
• Your faction's keep — a hall that grows with the battles your side wins. Furnish it,
  merge duplicates into finer pieces, and offer your best one to your church.
• A churchyard you plant in front of your congregation's building.
• The Harvest Road: daily quests, a walkable painted road, and rewards never for sale.

PEOPLE, WITHOUT A SCOREBOARD
• Make your character at the door: figure, skin tone and hair, all free.
• A companion. Earn a pet by playing — it walks beside you on your profile, and now in
  every place people gather: the hall, the churchyard, the road, your room.
• Tap anyone and meet them at full height, companion and all, instead of a small crop.
• Wash another player's feet. Twelve a day, one for each disciple — the one thing you
  can do to somebody here that isn't a challenge.
• Give a relic you found to another player. No message field, no trade, no haggling.
• A mailbox for gifts, buddy requests, washings and news. It carries nothing that is a
  comparison — no digest of what your friends scored, no "you're 4th".

THE STUDY TAB IS A LIBRARY NOW
• It used to be a wall of tiles. It's a room: shelves, lamplight, and Tabitha at the
  desk. Ask her for something to read and she'll fetch it and stamp it out to you.
• Your reports are the ledger on her desk. Your bag is the satchel on the floor.
• The first book you borrow each day is worth a little something.
• There are no due dates, nothing is ever overdue, and she has no opinion at all about
  how much you read.

THE REST
• The Journal: every milestone you've passed, gathered in one page. A number you got
  to, never a place you hold.
• Saved looks — put a whole outfit back on in one tap.
• Larger reading text, if you want it.
• A soundtrack. Every room has its own tune, and walking in is the only way to get one.
• Study got more generous: no daily ceiling on focus drills, no weekly cooldown on
  replays, and a relic to find when you study.

• A new creator-collab look: curls, a cream knit and a ukulele. Free with a code from
  the creator — like every code skin, it's never for sale.

Cosmetics are no longer sold. Everything that used to cost money is earned or free, and
anyone who bought a pack keeps every piece of it.

As always: no ads, no tracking, and a wrong answer still teaches you something.
```

> Keep this section per-release. Apple shows "What's New" on the product page for the
> current version only, so it should read as a change list, not as the description.

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
and there is **no** user-generated content shared publicly. Keep that answer honest by
knowing exactly where a user can type at all: a group name (visible only inside that
private group), their own username, and the "Add info" form on a church page. That last
one publishes NOTHING — it files a request that only staff can act on
(`submit_church_info_request`), so nothing a stranger types ever renders for another
player. Washing feet, the keep, the churchyard, the Upper Room, gifts, praying
and pets carry no text at all: they are taps on fixed objects. A gift has no message
field, a prayer stores a date and nothing else, and the one place figures appear to
speak to each other — the emoji bubbles in the crowd scenes — draws from a fixed
ten-emoji list nobody can add to. If Apple's form asks about UGC, "Infrequent/Mild" at most. This
lands at 12+ / 9+; either is fine.

> Do NOT check "Made for Kids." That opts you into the Kids Category and COPPA rules.

---

## Review notes (App Information → Notes for reviewer)

Two things a reviewer hits in the first thirty seconds, so they are said first and
plainly: most tabs ask for an account, and the app carries one in-app purchase. Both
have been true since 1.2.0 and are unchanged in 1.3.0 — this block is not
version-specific and does not need rewriting each release, unlike "What's New" above.

```
Verse Arcade is a Bible-learning game. Tap "Play today's verse" on the home screen to
play the full daily quiz immediately as a guest — no account, no email, no paywall.

PLEASE SIGN IN WITH THE ACCOUNT BELOW TO REVIEW THE REST. Beyond today's verse and your
own profile, the tabs (Battle, Study, Bible, Church) show a padlock and a "create an
account" card rather than their contents. This is intentional, not a bug or a broken
screen: those features are multiplayer or synced — a shared church building, a battle
against another person, a record of what you have read — and they have nowhere to live
on a single device without an account.

  Email: [FILL IN — create one before submitting]
  Password: [FILL IN]

IN-APP PURCHASE: there is exactly one, a non-consumable "founding patron" tip
(com.versearcade.app.patron_founding). It buys a cosmetic thank-you and nothing that
affects play, scores or standing. Cosmetics are otherwise earned or free. The shop is
hidden entirely unless StoreKit returns approved products, so it may not appear in a
sandbox build — that is deliberate fail-closed behaviour, not a missing screen. A
"Restore purchases" control is in Profile → Skins whenever StoreKit is reachable.

There are no external purchase links or steering of any kind. Everything digital is
sold through Apple's in-app purchase.

READ-ALOUD: the Upper Room's prayer sheet can read a prayer out loud. It uses the
voices already on the device through the standard speech synthesis API — nothing is
recorded, and no text is sent anywhere. A device with no installed voices shows a line
saying so rather than a dead button.

Account deletion: Profile tab → "Delete my account".
Sound, music and haptics: Settings.
```

## Demo account (REQUIRED before submitting)
This is no longer optional. Since the account wall landed, a reviewer without
credentials can only reach today's verse and the profile tab — everything else is a
padlock, which reads as "features behind a login" (Guideline 2.1) if the notes do not
explain it and hand them a way in.

Create one real account in the app, play a round on it so the profile is not empty,
then paste its credentials into the review notes above. Use an address you control and
a throwaway password; the account can be deleted from inside the app afterwards.

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
