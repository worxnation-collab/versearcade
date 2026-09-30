# Combo Clock

A watchOS prototype of Verse Arcade's round: five true/false questions, a
16.5-second clock each, and a combo you can **feel** without looking.

It's the web app's scoring and combo rules moved onto the wrist, with the
haptics as the feature:

| Moment | What the wrist feels |
|---|---|
| Question starts | `start` |
| 5 / 3 / 2 / 1 seconds left | one `click` each |
| First right answer | `success` |
| Combo *N* (N ≥ 2) | *N* quick `click`s, then `directionUp`. Count them and you know your streak |
| Wrong answer or time out | `retry`. Soft on purpose: a miss shows a teach line, it doesn't buzz at you |
| Round over | `stop` |

## Layout

```
RoundCore/     Swift package, Foundation only: engine, scoring, cue patterns, deck, tests
App/           SwiftUI watch app: views, a 10Hz clock, Pulse -> WKHapticType
project.yml    XcodeGen spec (the .xcodeproj is generated, not committed)
```

`RoundEngine` is a pure state machine over an injected clock, and every call
returns the cues it produced. So the timing (ticks fire once each, a wrist-down
sleep plays only the latest tick rather than a burst, a late tap counts as a
timeout) is unit-tested to the millisecond, with no simulator involved.
`Scoring` mirrors `SCORING`/`scoreQuestion()` in `src/lib`; the tests pin the
same numbers.

## Run it

```bash
cd RoundCore && swift test          # any platform, Linux included
brew install xcodegen && xcodegen   # macOS
open ComboClock.xcodeproj           # run the ComboClock scheme on a watch simulator
```

The simulator can't play haptics. Put it on a real watch to feel the combo.

## TestFlight

`codemagic.yaml` → **watch-comboclock** builds, signs and uploads to App Store
Connect. The one step you have to do by hand is creating the app record, bundle
id `com.versearcade.comboclock` (the API can't create apps). CI on GitHub
(`.github/workflows/combo-clock.yml`) runs the tests and compiles the app for
the watchOS simulator on every change here.

## Known limits

- Haptics only play while the app is frontmost. A backgrounded round keeps
  its clock (wall time, like the web) and settles when you raise your wrist, but
  it won't tap you while your wrist is down. Getting that needs
  `WKExtendedRuntimeSession`, and a quiz doesn't qualify for any of its session
  types.
- The deck is 16 bundled cards. The real thing would pull the day's verse.
