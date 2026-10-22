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
   Size it to the template's `aspect`: 1080×1350 for a 4:5 verse card,
   1920×1080 for a 16:9 series or notice card. Keep `background.color` set to
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
- **Sizes.** **Post**: the card at its own aspect, 1080x1350 for a 4:5 card
  (an Instagram portrait post) or 1920x1080 for a 16:9 one, square corners.
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
- **What a new template must stay inside.** A background gradient or overlay
  the export cannot parse (radial, `to right`, a stop with no %) is SKIPPED and
  the flat colour shows; the in-app card still draws it. Keep real art to a
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
