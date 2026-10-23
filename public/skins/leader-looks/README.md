# Adult Church Leader Looks

The owner's paintings for the five default looks included with the Church
Leader package — one man and one woman per look — plus ten men's tone/hair
variants. Wired by hand in `src/features/church/leaderLooks.tsx`
(`OWNER_LOOK_ART`, `OWNER_FEM_LOOK_ART`, `OWNER_VARIANTS`, `OWNER_FEM_VARIANTS`),
deliberately not through `GENERATED_ART`.

- classic-clergy.png, liturgical-vestments.png, professional-suit.png,
  robe-stole.png, contemporary.png — the look's own painting
- `female-<look>-<tone>[-<hair>].png` — the look's painting for a woman leader
- `<look>-<tone>-<hair>.png` — shown to a leader with exactly that tone and hair

Each was supplied on an opaque pink backdrop and cut out with
`node scripts/key-owner-figure.mjs <in.png> <out.png>` (`--shadow` for
`female-contemporary-medium` and `female-robe-stole-deep-black`, whose backdrop
carried a dark floor shadow). Run new paintings
through it rather than editing by hand.
