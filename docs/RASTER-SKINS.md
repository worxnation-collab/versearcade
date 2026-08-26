Raster skin images, served as-is (not bundled or hashed).

A file here is picked up by `RASTER_SKINS` in `src/components/Character.tsx`; a
skin listed there renders as an image instead of drawn SVG paths, and falls back
to the drawn version if the file is missing.

## Preparing a file

Generated character art arrives as a square frame with the figure, its
silhouette, a flat key colour and often a generator watermark. What lands here
has been through:

1. **Key** — flat magenta (#FF00FF) to transparency, with a soft edge and a
   despill pass on every pixel within 2px of transparency. Without that second
   pass the artwork's own magenta-tinted outline survives as a pink halo, which
   is invisible on the dark avatar circle and obvious anywhere else.
2. **Isolate** — split into regions by empty columns and keep the one carrying
   the most ink, which drops the silhouette and any corner watermark.
3. **Pad** — 8% empty below the feet, so the figure sits just above the ground
   shadow `Character` draws at y=162 of its 170-unit viewBox.
4. **Cap at 400px tall** — the avatar never renders above 92 CSS px, which is
   276 device pixels at 3x DPR. Past that it is bytes every user downloads and
   no user ever sees. 1024px sources were ~500KB each; capped they are ~90KB.

Placed with `preserveAspectRatio="xMidYMax meet"`, so the image should be
cropped tight to the figure with no baked-in ground shadow.

## This is a preview path, not a decision

Raster cannot compose — the free starter layers armour and items independently —
and it softens at the 18px presence chip in a way drawn paths do not. Anything
kept long-term should be redrawn as SVG.
