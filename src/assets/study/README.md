Generated book-cover art for the Study shelf — one image per book key
(`versus`, `focus`, `keep`, `replay`, `reports`, `bag`), produced by
`scripts/generate-study-covers.mjs` (Gemini image / "nano banana",
needs `GEMINI_API_KEY`). The shelf picks these up by filename; a book
whose image is missing simply keeps its drawn board, so a partial set
never breaks anything. Keep each under ~150 KB — they render at 148px.
