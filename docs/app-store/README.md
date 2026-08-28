# App Store screenshots

`6.7/` holds the current 6.7-inch iPhone set at **1290 × 2796**, the size App
Store Connect requires (minimum 3, maximum 10). `src/` holds the phone
screenshots they were made from, kept so the set can be rebuilt or re-ordered
without going back to the device.

Rebuild the whole set after dropping new shots into `src/`:

```bash
npm i --no-save sharp
node scripts/fit-screenshots.mjs docs/app-store/src
```

Output filenames come from the source filenames, so the `NN-name` prefixes are
what put the set in order — App Store Connect uploads them in the order you
give it, and shot 1 is the one that shows in search results.

## Current set

| # | Screen | Sells |
|---|---|---|
| 1 | Skins | The characters — what you're playing toward |
| 2 | You | Your figure at full size, streak, level, XP |
| 3 | My Church | The congregation you're growing, and its building |
| 4 | Study | The shelf: four ways to practise, none of them ranked |
| 5 | Bible Battle | Playing against a friend, and the team hall |

## Two things to know before shooting new ones

**A phone screenshot is never 1290 × 2796 on the nose.** It's whatever the panel
is, and it's shorter again if anything cropped it on the way over. Apple neither
scales nor letterboxes — the upload just fails. `fit-screenshots.mjs` scales to
width and makes up the difference as padding at the top, extending the image's
own top row so the background gradient continues with no seam. The padding goes
at the top because every screen here anchors content to the top and floats the
nav bar over the bottom, so the bottom edge is usually mid-card and extending
downward would smear it.

**Padding is dead space, and past about a quarter of the frame it looks like
it.** The script says so when a shot crosses that line. A short source either
wants a caption headline in that space (the usual App Store treatment) or wants
re-shooting taller.

## Shooting them

Easiest first:

- **Real device.** Open the TestFlight build on a 6.7" iPhone and screenshot.
  Send them over uncropped — a trimmed status bar costs height the script then
  has to pad back.
- **Browser.** <https://versearcade.org> in Chrome → DevTools → device toolbar →
  custom device 1290 × 2796 → capture full-size.

Either way, run them through the script before uploading. Re-check the set
whenever the app's chrome changes; a screenshot showing a nav bar or a screen
that no longer exists is worse than one fewer screenshot.
