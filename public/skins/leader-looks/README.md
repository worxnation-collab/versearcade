# Adult Church Leader Looks

The owner's paintings for the five default looks included with the Church
Leader package — one man and one woman per look — plus ten men's and ten
women's tone/hair variants. Wired by hand in `src/features/church/leaderLooks.tsx`
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

The ten women's variants (`female-<look>-<tone>-<hair>.png`, app keys) were
GENERATED from the owner's woman painting of each look, so they share its hand:
`node scripts/gen-leader-looks.mjs art/leader-looks-women.json <raw-dir>` with
`GEMINI_API_KEY` set. That script sends the painting on the backdrop pink as
the reference, asks for the same outfit and pose in another complexion and hair,
keeps the raw render out of the repo, and cuts it with `key-owner-figure.mjs
--shadow`. It never writes `generatedArt.ts`; wiring stays a hand edit in
`OWNER_FEM_VARIANTS`.
