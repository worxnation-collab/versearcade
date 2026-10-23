# Adult Church Leader Looks

The owner's paintings for the five default looks included with the Church
Leader package, plus ten tone/hair variants. Wired by hand in
`src/features/church/leaderLooks.tsx` (`OWNER_LOOK_ART`, `OWNER_VARIANTS`),
deliberately not through `GENERATED_ART`.

- classic-clergy.png, liturgical-vestments.png, professional-suit.png,
  robe-stole.png, contemporary.png — the look's own painting
- `<look>-<tone>-<hair>.png` — shown to a leader with exactly that tone and hair

Each was supplied on an opaque pink backdrop and cut out with
`node scripts/key-owner-figure.mjs <in.png> <out.png>`. Run new paintings
through it rather than editing by hand.
