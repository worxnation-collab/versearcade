# Church visual assets — verse cards, series graphics, notice cards

Part of the Content Generation package (`church_addons.content_generation`).
Migration `0133`, `src/data/churchAssetTemplates.ts` (the art),
`src/features/church/ChurchAssetCard.tsx` (the one renderer),
`src/store/churchAssets.ts`, `src/features/church/admin/AssetStudio.tsx`.

## Where the art goes (the part you will touch)

Everything visual lives in **`src/data/churchAssetTemplates.ts`**, one entry
per template. Nothing else needs to change to ship real art.

1. **Background image:** put the file at `public/church-assets/<template-id>/bg.jpg`
   (or `.png`/`.webp`) and set `background.image: '/church-assets/<id>/bg.jpg'`.
   Set the template's `aspect` to the IMAGE's, never the other way round — the
   card is `object-fit: cover`, so a mismatch crops the art silently. The
   shipped art is 784×1168 (2:3) for verse and notice cards and 1168×784 (3:2)
   for series headers, and those templates say so. Keep `background.color` set to
   the image's dominant colour, because a failed image falls back to it. If text
   sits over a busy area, add `background.overlay` (a CSS gradient).
2. **Layout:** each slot (`eyebrow`, `title`, `body`, `reference`, `footer`) is a
   box given in **percent of the card** (`x, y, w, h`). Type size is in **`cqw`**
   (percent of card width), so a layout is exact at every size from a 90px
   thumbnail to a full-width card. Leave a slot out and that text is not drawn.
   `minScale` lets long text shrink (by the square root of its length);
   `maxLines` clamps it.
3. **Fonts:** add the `@font-face` (or a Google Fonts `<link>`) in
   `src/index.css`, then set `fonts: { display, body, serif }` on the template to
   a stack starting with that family. A slot picks one with `font`.
4. **Ship it:** remove `placeholder: true`. Leaders see "Placeholder art · Name"
   under any card still marked as stand-in art.

Rules (`npm run build` runs `scripts/check-asset-templates.mjs` and fails on
the ones that break silently):

- **A template id is permanent.** Stored cards name it. To replace a look, add
  a new id and set `retired: true` on the old one. A retired template still
  renders its existing cards but is no longer offered. Never rename an id.
  (An unknown id renders with its kind's default template, never a blank card.)
- **Ids are prefixed by kind:** `verse_…`, `series_…`, `notice_…`. The server
  refuses a template id with the wrong prefix for its kind.
- Images must be under `/church-assets/` and must exist in `public/`. Slot boxes
  must fit inside the card.
- The first template of each kind is the default.

To add a whole new kind (for example a sermon quote), you need a migration, because
`church_assets.kind` has a check constraint and the server composes the payload.

## Decisions

**Storage: a card is DATA, not an image.** A row stores `template_id` plus a
`payload` (the words: reference, text, series, dates, church name, notice).
There is no storage bucket and no rendered file.

- New art reaches every existing card the moment it ships. No re-render, no
  backfill, and nothing to invalidate.
- No image hosting, CDN cost or upload path, and no URL that can leak outside
  the congregation (there is no public sharing in this pass).
- A stored card can never drift from what renders it.
- Cost: there is no file to post anywhere. Public/social export, when it comes,
  is a client-side rasterise of the same component (the Upper Room postcard's
  `lib/postcard.ts` path, including its native share branch). That's an
  addition, not a rewrite.

**Rendering: HTML/CSS on the client**, not canvas and not server-side images.
It is crisp at any DPI, accessible (`role="img"` with the words as its label),
and uses the app's own fonts. One component draws every surface, so the leader
reviews exactly what members get.

**The words never come from a model, and never from the client.**
`generate_church_asset` takes a kind, a source (a date, a series name, or the
live notice) and a template id. The server copies the text from the church's
own rows (`church_asset_source_payload`):

- The verse card copies the day's `church_verses` row. A drafted day's text was
  assembled by `church-draft` from fetched BSB verses (the model only picks
  which verse). A day the leader typed by hand carries the leader's own saved
  text: it is the leader's content, saved and approved by them.
- The series graphic copies the series name, its dates, its day count and up to
  seven references, all from saved rows.
- The notice card copies the live announcement.

"Generate" is therefore composition, not generation. There is no prompt field
anywhere, and none could be added without a new server path.

**Draft → approve, with staleness.** Every generate writes a draft. Approve and
discard need base leadership, so a base-tier leader can still review a card the
church made. Generating needs the add-on (`church_gen_can`). A card whose source
words have changed since it was made is **stale**: approve refuses it, the
leader sees "Out of date", and members never get it. Regenerating over an
approved card puts it back to draft (the UI asks first). Discard stamps
`discarded_at`; nothing is deleted.

**What members see** (`my_church_assets`, verified church members only, today
only, approved and fresh only):

- verse card: today's church verse, and only if that verse is itself approved;
- series graphic: the series of today's approved verse;
- notice card: the live announcement.

The cards appear in `ChurchLife` (church tab: the notice card replaces the text
notice, and the series graphic and verse card sit in the today's-verse box) and
on the `/play/church` result. No card exists anywhere a stranger, a board or
the global daily verse can reach. `visibility` is constrained to
`'congregation'`; widening it is a migration.

## How much text a look holds (2026-10-23)

Long text shrinks toward `size × minScale`, so no card ever overflows; what
happens instead is that a long verse on a small-type look comes out too small
to read. `bodyCapacity(template)` is the longest body, in characters, a look
sets at or above `READABLE_FLOOR` (3.2% of the card's width: ~11px on a
phone-width card, ~35px on a 1080px export). It is the inverse of `slotScale`,
so it cannot disagree with how the card actually draws, capped by `bodyMax`
where the BOX runs out first (Night family's band between the moon and the
family clips at ~112 characters; The path's sky at ~372). Both of those were
measured by rendering at 240-1080px, not reasoned.

- **The studio greys a look too small for the current words** ("For shorter
  text", with its capacity on hover) and defaults to the first look that fits,
  so a long verse never lands on Rays by default. A card already made on a look
  too small for its words says so under the card.
- **Sizes were raised where the art allows it**, found by measuring the size at
  which a SHORT verse first overflows: Rays 4.6→5.2 (185→237 characters),
  Beam 4.6→5.0 (185→219), Night reading 5.0→5.2 (219→237), The path 5.0→5.6
  (219→370), Kneeling 5.2→5.6 (237→275), notice Cosmos 4.2→5.4 (155→256),
  Night friends 4.0→4.6 (140→185). Rays, Beam and Night reading sit in narrow
  columns and overflow a short verse just above those sizes, so they stay
  "shorter text" looks for anything past ~220-237 characters. Elder, Halo,
  Prayer and Night family are short-notice looks by layout (126-140, 110).
- For scale: pool verses run to 237 characters (90th percentile 163), real
  church verses to 281 (90th percentile 228), notices are capped at 280.
- **Lamplight is retired**: its background was byte-identical to Night
  reading's, so the picker offered one look twice.
- `check-asset-templates.mjs` now fails the build on two pickable looks of the
  same kind sharing a background file, and on a DEFAULT verse or notice look
  that holds fewer than 240 characters.

## Export: a PNG for social

An approved, up-to-date card can be taken off the app by its church's
leadership: **Post it** under the card in the leader's studio (`AssetStudio`
→ `ExportRow`) offers **Share image** (the native or Web Share sheet) and, on
the web, **Download PNG**. It is drawn in the leader's own browser by
`lib/churchAssetExport.ts` and handed over through the postcard's
`shareImage` / `saveImage`. Nothing is uploaded or stored.

- **Who and what.** Only the leadership studio draws it, and only for a card
  that is approved, not stale, and (for a verse card) whose day is approved.
  That is exactly what members can already see. A draft cannot be exported.
- **Congregation-only stays the default.** `visibility` is still constrained to
  `'congregation'`; nothing about the card in the app changes. Posting the PNG
  somewhere is the leader's own act, outside the app.
- **Sizes.** **Post**: the card at its own aspect, 1080 wide for a portrait
  card or 1920 wide for a landscape one, square corners — EXCEPT a card taller
  than 4:5 (all the shipped 2:3 verse and notice art), which the feed would crop
  through its eyebrow and footer, so it posts whole on a 1080x1350 frame of its
  own dimmed background (`postsFramed`).
  **Story**: 1080x1920, the card unchanged and centred on a dimmed field of its
  own background, inside the Story safe zone (clear of the top 250px and bottom
  340px the app draws over). A story is a FRAME, not a relayout, so a template
  needs nothing extra to support it.
- **The notice card names the church.** Its top line is "From {church}" (it was
  "From your church's leaders", which read wrong to a stranger) and its footer
  is "Posted {date}". Every eyebrow is one line, so a long church name ends in
  an ellipsis rather than a clipped second line. These are `assetSlots`
  changes, so every existing card re-renders with them; staleness is decided
  by the server's source words and is unaffected.
- **Why a second renderer.** The card is HTML, and the only way to photograph
  HTML in a browser is an SVG `<foreignObject>` on a canvas. Safari taints the
  canvas for that (so `toBlob` throws), and web fonts and images inside it do
  not load. So the export draws from the same template DATA instead: boxes,
  colour, `linear-gradient(<deg>, <colour> <n>%, …)`, a cover image and an
  overlay. Sizing (`slotScale`, `slotFamily`, `SLOT_LINE_HEIGHT`) is imported
  from `churchAssetTemplates.ts`, not restated, so the two renderers can only
  differ in how they wrap a line.
- **What a new template must stay inside.** The export reads a colour,
  `linear-gradient(<deg> | to <side> [<side>], …)` with or without stop
  percentages, and `radial-gradient([ellipse] at X% Y%, …)` (the default
  farthest-corner size). Anything else (a `circle`, an explicit radial size,
  `conic-gradient`, several layered gradients) is SKIPPED in the export and the
  flat colour shows; the in-app card still draws it. Keep real art to a
  colour, that linear-gradient form and/or a `/church-assets/` image, and check
  one export after adding a template. A web font named in `fonts` must be
  loaded by the page (`document.fonts`) or the export falls back like the card
  does.
- **App Store build.** Share only (no download link, which a WKWebView
  ignores). There is no price or link in it, so nothing for review to gate.

## Where leaders make them

- **Schedule → a day's form** (`TodayVerseForm`): verse card for that date, and
  a series graphic when the day carries a series. This shows once the day is
  saved, because a card is made from what is saved.
- **Notices** (`NoticesPanel`): notice card for the live announcement.

Each `AssetStudio` shows live thumbnails of every look, drawn from the real
words before anything is created. It then offers Generate → Approve / Change
look / Discard.

## The shipped art (2026-10-22)

Twelve owner-supplied backgrounds, one template each, first of each kind the
once the default: verse — Parchment, Stillwater, First light, Clay, Vigil; series —
Meadow, Current, Ember; notice — Laurel, Blossom, Garden, Midnight. They are
not Nano Banana renders and are deliberately NOT in `GENERATED_ART` (the
hand-kept-table rule the road rewards and nav paintings follow), so a gen-art
run can never overwrite them. Each slot box was placed by rendering the card
with a long verse and a long notice and moving text off the painted
ornaments; re-check by rendering, not by reading numbers, if an image is
replaced. The six original stand-ins are `retired`: off the picker, still
drawing any card a church made before the art landed.

### Picture cards (2026-10-22)

Eleven more owner-supplied illustrations, with people in them: verse — Wonder,
Open hands, Family, Elder, Kneeling, The path, Lamplight (night, light ink in
the sky); series — Gathered; notice —
Friends, Quiet prayer, Reading corner. The rule for these is that **words never
cross a face**: each one puts its text in the picture's own empty space
(Kneeling's left column, The path's sky, Friends' top) or on a soft panel faded
in over the lower third (`background.overlay` — cream, or navy on Elder, where
the cardigan already is). Gathered's source was 3:2 with the group dead centre
and no room for a title, so it was re-composed on its own flat background
(cropped left, extended right in the measured edge colour) — seamless only
because that background is flat; don't do it to a painted edge. The path's top
band is the tightest box in the set and sets a long verse small; it is the one
to avoid for a passage over ~200 characters.

### The official style (2026-10-22) — the defaults

Thirteen templates from the owner's "official style" set: night purple and
gold, the app's own palette. They lead `ASSET_TEMPLATES`, so they are the
defaults a leader sees first: **Glow** (verse), **Cosmos** (series) and
**Cosmos** (notice — the one landscape notice, sharing the series art). With
them: verse — Golden path, Night reading, Rays, Beam; series — Vine circle;
notice — Night family, Night friends, Elder, Halo, Prayer. The light set above
stays pickable; nothing was retired, so a card already made with one keeps it.

Same rule as the picture cards — words never cross a face — plus two scars
found by rendering: on Glow the verse sits ABOVE the light and the reference
below it (light ink over the core measured luminance 178, unreadable), and on
Golden path the footer moved off the bright path to sit under the reference.
Vine circle's art filled its whole frame, so it is scaled into the left of the
card on its own flat navy (measured from the corners), the Gathered trick.

