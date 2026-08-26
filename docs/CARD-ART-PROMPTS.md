# Card art prompts — the 18 scene archetypes

Generation prompts for regenerating the player-card backgrounds in
`src/data/cardArt.tsx`, one per `Scene` archetype. Written for **Recraft V4 Pro
SVG** (true vector output); they work in a raster model too, but then you own a
tracing step and the palette hooks below stop being free.

## Before you generate anything

**1. Make a house style.** Screenshot 5 of the current rendered cards and create
a Recraft custom style from them. Generate every scene against that style, or
the 18 will not read as one set — which is the whole point, since these sit
side by side in the shelf grid.

**2. Understand what you are replacing.** There are 42 card backgrounds but only
18 drawings. `playerCards.ts` recolors each archetype through a 4-slot `Palette`
(`sky[0]`, `sky[1]`, `land`, `glow`, `accent`), so `flames` serves Week Warrior
in red, High Scorer in orange and Centurion in gold from one file. Each prompt
below carries **one canonical palette** and lists the other cards riding on it.

**3. The palette must survive.** Generate with the exact five hexes given, then
find/replace them back to the `p.*` variables on the way into the codebase. If
Recraft returns baked gradient stops instead of your five flat fills, that scene
is a failure — regenerate it rather than hand-patching, or you will be
maintaining 42 files instead of 18.

**4. Budget.** SVGO everything, ceiling of ~120 paths / 15KB gzipped per scene.
AI vector output routinely lands at 800+ paths and the shelf grid renders many
at once on mid-range Android.

## How the card actually crops and covers the art

These numbers were measured in a browser, not estimated, and they are the single
most important thing on this page — the scenes are authored 400×240 but no card
ever shows a 400×240 frame.

**Two crops, because the card is a fixed height at any width.** Every card
renders the SVG with `preserveAspectRatio="slice"` into a box that is 260 tall
whatever its width:

| Card width | What you see of the 400×240 viewBox |
|---|---|
| 380 (phone) | full height, **x cropped to 25…375** |
| 520 (app max) | full width, **y cropped to 20…220** |

Only **x 25…375, y 20…220** survives both. Anything outside is cropped away on
one layout or the other, so nothing load-bearing goes there.

**Then the card's own contents cover nearly all of what is left.** Measured
glyph and element boxes, in viewBox coordinates:

| Element | Box | Effect on art |
|---|---|---|
| Avatar disc | x 40…99, y 20…79 | fully opaque |
| Username | x 112…240, y 18…43 | large white type, has a shadow |
| XP figure | x 281…360, y 51…64 | small type, no shadow — the fragile one |
| XP bar | x 112…360, y 66…82 | solid element |
| Stat grid | x 40…360, y 97…222 | tiles of `rgba(10,4,28,0.5)` + 3px backdrop blur |

So there is **no unoccupied region on this card at all**. Every scene is read
through type or through translucent tiles. Two consequences worth designing
around:

- **Detail finer than ~6px dies below y 97.** The stat tiles blur it. Broad
  tonal masses are the only thing that survives down there — which is also why
  the bottom of every scene should be *dark*, so the white stat numerals read.
- **The one low-ink pocket is x 240…375, y 18…48** — right of the short username
  and above the XP figure. A bright, hard-edged element belongs there and
  nowhere else. Soft haloes may spill anywhere; it is only the hot core that has
  to respect the pocket.

**The scrim.** A `linear-gradient(rgba(8,3,24,0.20) → rgba(8,3,24,0.44))` overlay
sits on top of every card, so art is seen 20–45% darker than generated. Glows
must be bright and darks must stay separated from each other.

The `LIGHT` line in each prompt places that scene's light source in the pocket.
All 18 archetypes in `cardArt.tsx` now centre their hero on the `HERO_X, HERO_Y`
constant at **(322, 38)** for exactly this reason. The versions they replaced put
their subjects wherever the composition suggested — sunrise's sun at y 150,
lamp's flame at y 120, stone's tablets at y 108…208, host's multitude behind the
username — which is most of why so many cards read as flat washes.

So these prompts describe art the codebase already draws. Use them if you want a
richer painted take on an archetype from a generator; the geometry is the part
that has to hold either way.

---

## 1. `sunrise`

Canonical: **First Light**. Also serves Early Bird, Jubilee Trumpet.

```
Flat vector illustration, wordless landscape, 5:3 (400x240), fixed low horizon.

SUBJECT: a low sun breaking the horizon behind rolling hills, long straight rays
fanning across the whole sky, the first morning of the world.

STYLE: layered silhouette illustration — 3 to 4 flat depth planes (sky gradient,
far ridge, near foreground), one dominant light source with a soft radial halo,
small scattered accents for life. Solid shapes and simple linear/radial
gradients only. Reverent, calm, cinematic, deep-night arcade mood.

PALETTE: exactly five flat colors — sky top #7a3f2a, sky bottom #2a1030,
land #2a1030, glow #ffb35c, accent #ffe0b0. No color outside this set.

LIGHT: sun disc low and right, at 75% width / 62% height, partly occluded by the
front ridge. Rays radiate from that exact point.

COMPOSITION: nothing load-bearing outside x 25-375 / y 20-220 of the 400x240
frame — the rest is cropped on one layout or the other. Keep the bottom third
dark and free of fine detail; it sits behind blurred translucent tiles. The
image is darkened 20-45% by an overlay, so keep the glow bright and the darks
separated.

EXCLUDE: text, letters, numbers, human figures, faces, logos, watermarks,
borders, frames, vignettes, photographic texture, noise, grain, mesh gradients,
strokes thinner than 2px, drop shadows.
```

---

## 2. `night`

Canonical: **Classic** (the default everyone starts with — get this one right
first, it is the most-seen card in the app). Also serves Night Owl, Fortnight,
David's Harp.

```
Flat vector illustration, wordless landscape, 5:3 (400x240), fixed low horizon.

SUBJECT: a deep clear night over quiet hills, a crescent moon high and right, a
dense field of small stars.

STYLE: layered silhouette illustration — 3 to 4 flat depth planes, one dominant
light source with a soft radial halo, scattered stars of varying size for life.
Solid shapes and simple linear/radial gradients only. Reverent, calm, cinematic,
deep-night arcade mood.

PALETTE: exactly five flat colors — sky top #3a1f7a, sky bottom #150a34,
land #1d1046, glow #a06bff, accent #d9c8ff. No color outside this set.

LIGHT: crescent moon at 78% width / 29% height with a soft halo. Stars only in
the upper two thirds; none over the land.

COMPOSITION: nothing load-bearing outside x 25-375 / y 20-220 of the 400x240
frame — the rest is cropped on one layout or the other. Keep the bottom third
dark and free of fine detail; it sits behind blurred translucent tiles. The
image is darkened 20-45% by an overlay, so keep the glow bright and the darks
separated.

EXCLUDE: text, letters, numbers, human figures, faces, logos, watermarks,
borders, frames, vignettes, photographic texture, noise, grain, mesh gradients,
strokes thinner than 2px, drop shadows.
```

---

## 3. `star`

Canonical: **Star of Bethlehem**. Also serves Speed Seraph.

```
Flat vector illustration, wordless landscape, 5:3 (400x240), fixed low horizon.

SUBJECT: one enormous four-pointed star burning over dark hills, its vertical
points far longer than its horizontal ones, a faint scatter of lesser stars
around it.

STYLE: layered silhouette illustration — 3 to 4 flat depth planes, one dominant
light source with a soft radial halo. Solid shapes and simple linear/radial
gradients only. Reverent, calm, cinematic, deep-night arcade mood.

PALETTE: exactly five flat colors — sky top #1c2058, sky bottom #070a20,
land #0e1235, glow #ffe98a, accent #fff6cf. No color outside this set.

LIGHT: the great star at 67% width / 28% height. It is the only strong light —
no moon competing with it, and the lesser stars stay dim.

COMPOSITION: nothing load-bearing outside x 25-375 / y 20-220 of the 400x240
frame — the rest is cropped on one layout or the other. Keep the bottom third
dark and free of fine detail; it sits behind blurred translucent tiles. The
image is darkened 20-45% by an overlay, so keep the glow bright and the darks
separated.

EXCLUDE: text, letters, numbers, human figures, faces, logos, watermarks,
borders, frames, vignettes, photographic texture, noise, grain, mesh gradients,
strokes thinner than 2px, drop shadows.
```

---

## 4. `flames`

Canonical: **Week Warrior**. Also serves High Scorer, Centurion.

```
Flat vector illustration, wordless abstract scene, 5:3 (400x240).

SUBJECT: tongues of fire licking up from the bottom edge of the frame, tall and
narrow, with embers drifting upward through the dark above them. No fuel, no
ground, no fireplace — the flames simply rise out of the bottom edge.

STYLE: layered silhouette illustration — overlapping flame shapes in 2 to 3
depth planes, brighter and smaller toward the front. Solid shapes and simple
linear/radial gradients only. Reverent, fierce, cinematic, deep-night arcade
mood.

PALETTE: exactly five flat colors — sky top #63212c, sky bottom #1c0a1e,
land #220c20, glow #ff6b3d, accent #ffc46b. No color outside this set.

LIGHT: the fire is the only light source and it comes from the bottom edge.
Flames reach no higher than half the frame height; embers rise into the top half.

COMPOSITION: nothing load-bearing outside x 25-375 / y 20-220 of the 400x240
frame. The bottom third carries the flames, so keep them dense and dark-rooted
rather than bright across the whole width — fine detail there is blurred away by
the tiles over it. The image is darkened 20-45% by an overlay, so
keep the glow bright and the darks separated.

EXCLUDE: text, letters, numbers, human figures, faces, logos, watermarks,
borders, frames, vignettes, photographic texture, noise, grain, mesh gradients,
strokes thinner than 2px, drop shadows.
```

---

## 5. `water`

Canonical: **Jordan Water**. Also serves Loaves & Fish, Water Jar.

```
Flat vector illustration, wordless seascape, 5:3 (400x240), fixed low horizon.

SUBJECT: a calm sea under a pale sun, concentric ripple lines running to the
horizon, and a column of light spilling across the water toward the viewer.

STYLE: layered silhouette illustration — flat sky, flat water plane, thin
horizontal ripple strokes thinning with distance, a few soft flat clouds. Solid
shapes and simple linear/radial gradients only. Reverent, calm, cinematic,
deep-night arcade mood.

PALETTE: exactly five flat colors — sky top #1e4a6b, sky bottom #08182c,
land #0d2c3e, glow #5ee7df, accent #c6f7f3. No color outside this set.

LIGHT: sun disc centered at 50% width / 40% height, low and hazy. Its reflection
widens as it comes toward the viewer, reaching the bottom edge.

COMPOSITION: the light column is centered, so keep the water left of it dark and
unbroken. Keep the bottom third low-contrast and free of fine ripple detail — it
sits behind blurred tiles. The
image is darkened 20-45% by an overlay, so keep the glow bright and the darks
separated.

EXCLUDE: text, letters, numbers, human figures, faces, boats, fish, logos,
watermarks, borders, frames, vignettes, photographic texture, noise, grain, mesh
gradients, strokes thinner than 2px, drop shadows.
```

---

## 6. `rainbow`

Canonical: **Covenant Rainbow**. Only card on this archetype — you can be
specific without breaking anything.

```
Flat vector illustration, wordless landscape, 5:3 (400x240), fixed low horizon.

SUBJECT: a full rainbow arcing edge to edge over dark hills after rain, the sky
still heavy with breaking cloud.

STYLE: layered silhouette illustration — 3 flat depth planes, soft flat clouds,
a broad banded arc. Solid shapes and simple linear/radial gradients only.
Reverent, calm, cinematic, deep-night arcade mood.

PALETTE: the arc uses seven spectrum bands (#ff6b6b, #ff9f1c, #ffd23f, #6fce7f,
#4ecdc4, #5b7cf0, #a06bff). Everything else uses exactly five flat colors — sky
top #33417e, sky bottom #0f0c26, land #182050, glow #cfe6ff, accent #ffffff.

LIGHT: diffuse, from behind the cloud break at upper center. No sun disc.

COMPOSITION: the arc must thin and fade toward both ends where it meets the
frame edges rather than stopping at full strength. Keep the bottom third dark and free of
fine detail; nothing load-bearing outside x 25-375 / y 20-220. The image is darkened 20-45% by
an overlay, so keep the bands saturated.

EXCLUDE: text, letters, numbers, human figures, faces, arks, animals, logos,
watermarks, borders, frames, vignettes, photographic texture, noise, grain, mesh
gradients, strokes thinner than 2px, drop shadows.
```

---

## 7. `mountain`

Canonical: **Flawless**. Also serves Co-op Climber, Month Mountain, Pilgrim
Medallion.

```
Flat vector illustration, wordless landscape, 5:3 (400x240).

SUBJECT: a range of sharp overlapping peaks, the tallest lit on one face, cold
and high and still.

STYLE: layered silhouette illustration — 3 flat depth planes of peaks, each
lighter and hazier with distance (atmospheric perspective), the nearest almost
black. Solid shapes and simple linear/radial gradients only. Reverent, calm,
cinematic, deep-night arcade mood.

PALETTE: exactly five flat colors — sky top #245a78, sky bottom #08192e,
land #0e2440, glow #7fe6ff, accent #d8f4ff. No color outside this set.

LIGHT: small cold sun at 80% width / 29% height. It must actually strike the
peaks — the lit face of the tallest summit is a hard-edged flat shape, not a
gradient.

COMPOSITION: put the tallest peak just right of center so it clears the avatar.
Keep the bottom third dark and free of fine detail; nothing
load-bearing outside x 25-375 / y 20-220.
The image is darkened 20-45% by an overlay, so keep the glow bright and the
darks separated.

EXCLUDE: text, letters, numbers, human figures, faces, climbers, flags, logos,
watermarks, borders, frames, vignettes, photographic texture, noise, grain, mesh
gradients, strokes thinner than 2px, drop shadows.
```

---

## 8. `temple`

Canonical: **Half Century**. Also serves Illuminated Icon, Golden Chalice,
Widow's Mite, Kingdom Keys — the biggest family, so keep it neutral.

```
Flat vector illustration, wordless architectural scene, 5:3 (400x240).

SUBJECT: a colonnade of six heavy stone pillars in full silhouette, seen
straight on, with warm light flooding from behind them and a solid entablature
across the top.

STYLE: layered silhouette illustration — flat black-on-glow architecture, no
interior detail, light spilling between the columns. Solid shapes and simple
linear/radial gradients only. Reverent, monumental, cinematic, deep-night arcade
mood.

PALETTE: exactly five flat colors — sky top #6b4a18, sky bottom #241505,
land #2a1a08, glow #ffc861, accent #ffeab5. No color outside this set.

LIGHT: a single source directly behind the colonnade at 50% width / 50% height.
Columns read as pure silhouette against it.

COMPOSITION: pillars evenly spaced across the full width, floor band across the
bottom. Because the light is central, keep the leftmost two columns and the
floor band dark and quiet — interface elements sit there. The image is darkened
20-45% by an overlay, so keep the glow bright.

EXCLUDE: text, letters, numbers, human figures, faces, statues, altars, logos,
watermarks, borders, frames, vignettes, photographic texture, noise, grain, mesh
gradients, strokes thinner than 2px, drop shadows.
```

---

## 9. `scroll`

Canonical: **Scroll Fragment**. Also serves Devoted, Apostles' Letter (Devoted
recolors this violet — so no warm parchment tones baked in).

```
Flat vector illustration, wordless flat-lay texture, 5:3 (400x240).

SUBJECT: an open parchment scroll filling the frame, rolled edges running off
the top and bottom, its surface ruled with faint horizontal lines suggesting
writing — abstract rules only, never actual letterforms.

STYLE: flat vector, straight-on, no perspective. Two rolled bands and a flat
sheet between them. Solid shapes and simple linear gradients only. Reverent,
scholarly, cinematic, deep-night arcade mood.

PALETTE: exactly five flat colors — sky top #4a3f28, sky bottom #17130b,
land #6b5c3c, glow #e0cf9a, accent #fff2cf. No color outside this set.

LIGHT: even and diffuse, very slightly brighter at center. No point source.

COMPOSITION: the ruled lines must be irregular in length so the block reads as
text rather than a table — vary each line, break some short. Keep the ruled lines
out of the bottom third entirely — blurred tiles turn them to mush — and nothing
load-bearing outside x 25-375 / y 20-220. The image is darkened 20-45% by an overlay.

EXCLUDE: real text, letters, numbers, glyphs, calligraphy, human figures, faces,
hands, quills, seals, logos, watermarks, borders, frames, vignettes,
photographic texture, noise, grain, mesh gradients, strokes thinner than 2px,
drop shadows.
```

---

## 10. `lamp`

Canonical: **Clay Lamp**. Also serves Anointing Oil, Ancient Menorah.

```
Flat vector illustration, wordless landscape, 5:3 (400x240), fixed low horizon.

SUBJECT: a single small flame burning alone in a wide darkness, its pool of
warm light falling away into a deep night, a low dark ridge beneath it and a few
faint stars above.

STYLE: layered silhouette illustration — one bright teardrop flame, one large
soft radial pool of light, flat dark land. Solid shapes and simple radial
gradients only. Reverent, intimate, cinematic, deep-night arcade mood.

PALETTE: exactly five flat colors — sky top #3a2a16, sky bottom #120a04,
land #1e1408, glow #ffbe5c, accent #ffe3ac. No color outside this set.

LIGHT: the flame at 75% width / 50% height is the only source. Its glow reaches
roughly a third of the frame and must fall off smoothly to full dark before the
left edge.

COMPOSITION: the whole left half stays near-black — this is the darkest scene in
the set and that is the point. Keep the bottom third low-contrast. The image is
darkened 20-45% by an overlay, so keep the flame and its inner pool bright.

EXCLUDE: text, letters, numbers, human figures, faces, hands, lampstands with
ornament, logos, watermarks, borders, frames, vignettes, photographic texture,
noise, grain, mesh gradients, strokes thinner than 2px, drop shadows.
```

---

## 11. `radiance`

Canonical: **Combo King**. Also serves Leper King (gold), Alabaster Jar (white)
— so keep the shape neutral enough to recolor into all three.

```
Flat vector illustration, wordless abstract scene, 5:3 (400x240).

SUBJECT: an overwhelming source of light at the center of the frame, throwing
long straight rays out in every direction, with a low dark horizon at the
bottom. A throne implied by light alone — nothing solid at the center.

STYLE: flat vector — a large soft radial core and 20 to 28 straight tapered rays
radiating from it at even angles, alternating longer and shorter. Solid shapes
and simple radial gradients only. Reverent, overwhelming, cinematic, deep-night
arcade mood.

PALETTE: exactly five flat colors — sky top #5a2a4a, sky bottom #1c0a24,
land #28102e, glow #ff6b9d, accent #ffd0e2. No color outside this set.

LIGHT: dead center at 50% width / 50% height. Rays reach every edge of the frame.

COMPOSITION: rays must be individually faint — the effect comes from their
number, not their opacity, or the card will fight the interface on top of it.
Keep the bottom third dark where the horizon sits. The image is darkened 20-45% by
an overlay.

EXCLUDE: text, letters, numbers, human figures, faces, thrones, crowns, wings,
logos, watermarks, borders, frames, vignettes, photographic texture, noise,
grain, mesh gradients, strokes thinner than 2px, drop shadows.
```

---

## 12. `field`

Canonical: **Mustard Seed**. Also serves Manna, Shepherd's Crook.

> **Note the conflict.** This is the one archetype whose light sits at 24% width
> — inside the quiet zone, right behind the avatar. Either move the sun to the
> right as written below (recommended, and then update `layersFor` to match), or
> keep it left and force it very low-contrast.

```
Flat vector illustration, wordless landscape, 5:3 (400x240), fixed low horizon.

SUBJECT: a field of tall grain stalks along the bottom of the frame, heavy heads
catching the light, standing at slightly different heights, under a wide low sun.

STYLE: layered silhouette illustration — flat sky, a band of ground, and a dense
row of thin vertical stalks each topped with a small oval head. Solid shapes and
simple linear/radial gradients only. Reverent, warm, cinematic, deep-night
arcade mood.

PALETTE: exactly five flat colors — sky top #4a5e2c, sky bottom #0f160b,
land #1e2a12, glow #a8d96b, accent #e0f5b8. No color outside this set.

LIGHT: sun disc at 72% width / 32% height, hazy and low. The stalk heads on the
right catch it most; those on the left fall into silhouette.

COMPOSITION: stalks occupy the bottom third only and must vary in height by at
least a third so the row never reads as a comb. Keep the bottom third low-contrast; stalk
detail there is blurred away by the tiles over it. The image is
darkened 20-45% by an overlay.

EXCLUDE: text, letters, numbers, human figures, faces, scythes, barns, logos,
watermarks, borders, frames, vignettes, photographic texture, noise, grain, mesh
gradients, strokes thinner than 2px, drop shadows.
```

---

## 13. `storm`

Canonical: **Saved by Grace**. Also serves Descending Dove.

```
Flat vector illustration, wordless landscape, 5:3 (400x240), fixed low horizon.

SUBJECT: a heavy bank of storm cloud across the top of the frame with one clean
shaft of light breaking through a gap in it and widening down onto dark hills.

STYLE: layered silhouette illustration — overlapping flat cloud masses, one
hard-edged tapered beam, flat dark land. Solid shapes and simple linear
gradients only. Reverent, dramatic, cinematic, deep-night arcade mood.

PALETTE: exactly five flat colors — sky top #2c3f6b, sky bottom #0c1226,
land #151a35, glow #7fe6ff, accent #d6f6ff. No color outside this set.

LIGHT: one beam only, narrow where it leaves the cloud gap at 52% width / 17%
height and widening to roughly half the frame width at the bottom edge.

COMPOSITION: exactly one beam — a second breaks the image. The cloud bank must
be visibly layered from at least three overlapping masses, not one blob. Keep
the bottom third dark and free of fine detail, and nothing load-bearing
outside x 25-375 / y 20-220. The
image is darkened 20-45% by an overlay.

EXCLUDE: text, letters, numbers, human figures, faces, birds, doves, lightning,
rain streaks, logos, watermarks, borders, frames, vignettes, photographic
texture, noise, grain, mesh gradients, strokes thinner than 2px, drop shadows.
```

---

## 14. `stone`

Canonical: **Tablets of the Law**. Only card on this archetype.

```
Flat vector illustration, wordless scene, 5:3 (400x240).

SUBJECT: two upright stone tablets with rounded tops standing side by side at
the center of the frame, ruled with faint horizontal lines suggesting inscribed
commandments — abstract rules only, never actual letterforms — with a great
radiance behind them.

STYLE: flat vector, straight-on, no perspective. Solid slab shapes in
silhouette against a radial burst. Solid shapes and simple radial gradients
only. Reverent, monumental, cinematic, deep-night arcade mood.

PALETTE: exactly five flat colors — sky top #3b4055, sky bottom #12141f,
land #4a5064, glow #c8d0dd, accent #f0f4fa. No color outside this set.

LIGHT: radial burst centered behind the tablets at 50% width / 50% height, rays
reaching the frame edges.

COMPOSITION: the two tablets together occupy the middle third of the width and
sit just below vertical center, clear of the avatar at top left and the stat row
at the bottom. Four ruled lines per tablet, of varying length. The image is
darkened 20-45% by an overlay.

EXCLUDE: real text, letters, numbers, Hebrew, Roman numerals, glyphs, human
figures, faces, hands, logos, watermarks, borders, frames, vignettes,
photographic texture, noise, grain, mesh gradients, strokes thinner than 2px,
drop shadows.
```

---

## 15. `garden`

Canonical: **Olive Branch**. Also serves Palm Frond.

```
Flat vector illustration, wordless landscape, 5:3 (400x240), fixed low horizon.

SUBJECT: leafy vines curling in from the left and right edges of the frame,
their leaves catching a soft high sun, over a quiet low ridge. A garden framing
an empty center.

STYLE: layered silhouette illustration — smooth curving vine stems with small
oval leaves set at alternating angles along them, flat land beneath. Solid
shapes and simple linear/radial gradients only. Reverent, verdant, cinematic,
deep-night arcade mood.

PALETTE: exactly five flat colors — sky top #3d6b4a, sky bottom #0d1a13,
land #16301f, glow #8fd694, accent #d8f2d5. No color outside this set.

LIGHT: soft sun high and centered at 50% width / 25% height, diffuse rather than
a hard disc.

COMPOSITION: vines enter from the edges and stop well before the center — the
middle of the frame stays open. Keep the left-hand vine sparser and darker than
the right-hand one, since the avatar sits over it. Keep the bottom third
low-contrast. The image is darkened 20-45% by an overlay.

EXCLUDE: text, letters, numbers, human figures, faces, hands, fruit, flowers,
serpents, logos, watermarks, borders, frames, vignettes, photographic texture,
noise, grain, mesh gradients, strokes thinner than 2px, drop shadows.
```

---

## 16. `deep`

Canonical: **Pearl of Great Price**. Only card on this archetype.

```
Flat vector illustration, wordless underwater scene, 5:3 (400x240).

SUBJECT: the view from deep underwater looking up — light entering from the
surface far above and dissolving into darkness below, with slow motes suspended
in the water and a faint surface plane at the very top.

STYLE: flat vector — one large soft vertical gradient from a bright surface to
near-black depths, scattered small circles as suspended particles. Solid shapes
and simple radial gradients only. Reverent, still, cinematic, deep-night arcade
mood.

PALETTE: exactly five flat colors — sky top #3f3a5c, sky bottom #0f0d1c,
land #1c1a30, glow #f2e9ff, accent #ffffff. No color outside this set.

LIGHT: from the surface at 50% width / 0% height, falling straight down and
fading out by two thirds of the frame height.

COMPOSITION: no horizon and no ground — this is the one scene with no land
plane. Motes must vary in size and sit mostly in the upper half. Keep the bottom
35% almost black. The image is darkened 20-45% by an overlay, so keep the
surface light bright.

EXCLUDE: text, letters, numbers, human figures, faces, divers, fish, shells,
pearls, coral, logos, watermarks, borders, frames, vignettes, photographic
texture, noise, grain, mesh gradients, strokes thinner than 2px, drop shadows.
```

---

## 17. `ladder`

Canonical: **Jacob's Ladder** (Angels Pack). Only card on this archetype.

> Figures are **required** here — note the shortened exclude list.

```
Flat vector illustration, wordless scene, 5:3 (400x240), fixed low horizon.

SUBJECT: a ladder or stairway standing on the earth with its top reaching into
a blaze of light in the heavens, its two rails converging as they rise, with
small winged figures ascending and descending alongside it. Genesis 28:12.

STYLE: layered silhouette illustration — a tapering ladder in bright thin
strokes inside a wide shaft of light, flat dark land at the base, small solid
silhouetted figures. Solid shapes and simple linear/radial gradients only.
Reverent, awestruck, cinematic, deep-night arcade mood.

PALETTE: exactly five flat colors — sky top #2a2270, sky bottom #0a0722,
land #150f3c, glow #ffe08a, accent #fff4cf. No color outside this set.

LIGHT: a radial blaze at the top of the ladder, at 51% width / 12% height. Rungs
grow brighter the higher they climb.

COMPOSITION: the ladder rises just right of center, from the bottom edge to the
light. Winged figures are small solid silhouettes — upright, robed, wings
raised, one clearly higher than the others — and must read as figures rather
than birds at thumbnail size, so keep the wings above the shoulder line. Three
figures at most. Keep the bottom third dark and free of fine detail.

EXCLUDE: text, letters, numbers, faces, facial features, hands, feet, detailed
anatomy, feathers, logos, watermarks, borders, frames, vignettes, photographic
texture, noise, grain, mesh gradients, strokes thinner than 2px, drop shadows.
```

---

## 18. `host`

Canonical: **Heavenly Host** (Angels Pack). Only card on this archetype.

> Figures are **required** here too.

```
Flat vector illustration, wordless scene, 5:3 (400x240), fixed low horizon.

SUBJECT: a multitude of winged figures breaking over dark fields, arranged in a
shallow arc with the light rising behind them, the largest at the center and
the rest diminishing toward both edges. Luke 2:13.

STYLE: layered silhouette illustration — solid silhouetted figures against a
bright sky, flat dark land beneath, a scatter of stars. Solid shapes and simple
radial gradients only. Reverent, overwhelming, cinematic, deep-night arcade mood.

PALETTE: exactly five flat colors — sky top #1b2f63, sky bottom #06091f,
land #0d1633, glow #ffeeb4, accent #fffaf0. No color outside this set.

LIGHT: rising from behind the host at 50% width / 14% height, so every figure
reads as silhouette against it.

COMPOSITION: seven figures in a shallow downward arc — largest and highest at
center, smaller and lower toward each edge, fading in opacity outward. Each is
upright and robed with wings raised above the shoulder line, so they read as
figures rather than birds at thumbnail size. Keep the bottom third dark land.

EXCLUDE: text, letters, numbers, faces, facial features, hands, feet, detailed
anatomy, feathers, instruments, halos as rings, logos, watermarks, borders,
frames, vignettes, photographic texture, noise, grain, mesh gradients, strokes
thinner than 2px, drop shadows.
```

---

## Integrating the output

1. Export SVG, run through SVGO.
2. Confirm your five hexes survived as flat fills. Replace them with the
   `Palette` slots: `p.sky[0]`, `p.sky[1]`, `p.land`, `p.glow`, `p.accent`.
3. Wrap as a layer function in `cardArt.tsx` and wire it into `layersFor()`.
   Keep the `id` prefix on every gradient id — several cards render on the same
   screen and duplicate ids will cross-contaminate.
4. Check the scene against **every** palette that rides on it, not just the
   canonical one. `flames` in Centurion gold must work as well as Week Warrior
   red, or you have not finished.
5. Look at it on the real card with the avatar and stats on top, at both
   `compact` and full size, before keeping it.
