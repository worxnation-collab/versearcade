// The Bible's interior is paper, not app chrome.
//
// Everywhere else Verse Arcade is a dark cosmic arcade; inside the book it's a
// page — warm cream, ink text, a gutter where the spine folds. That's the whole
// point of the feature: you opened a book, so you should be looking at one. It
// also fixes the highlighter metaphor, which only reads as a highlighter on
// light paper — a gold wash on a violet card reads as "selected", a gold wash on
// cream reads as "I marked this".
//
// These are local tokens rather than :root CSS variables on purpose: they apply
// to the inside of the book and nowhere else, and the rest of the app must not
// start borrowing them.

export const PAPER = {
  /** The page itself, with the faint warmth of aged paper toward the gutter. */
  page: 'linear-gradient(103deg, #efe4c8 0%, #f8f2e2 14%, #fdfaf0 46%, #f7f0dd 100%)',
  /** Body text: near-black with a brown cast, the way ink sits on cream. */
  ink: '#2a2118',
  inkDim: '#5d5142',
  inkFaint: '#8b7d69',
  /** Rules, gutters and hairlines. */
  rule: 'rgba(58, 44, 22, 0.16)',
  ruleSoft: 'rgba(58, 44, 22, 0.09)',
  /** Verse numbers and chapter drop caps — the red-letter tradition, softened. */
  accent: '#9a2f2f',
  /** The gilt edge and the ribbon. */
  gilt: '#b8892b',
} as const

// The four states on paper. Saved is a real highlighter stripe; studied is a
// wash of ink-blue; read is the faintest grey, the trace of a thumb; unread is
// bare page. They ride a lightness ramp rather than a hue wheel, so they stay
// separable for every kind of color vision — and each is spelled out in text
// besides, so meaning never rides on color alone. (Same rule as the Study
// chart; see CLAUDE.md.)
//
// Measured rather than eyeballed, composited over the page:
//   - ink on every tier: 11.4:1 or better (WCAG wants 4.5:1 for body text)
//   - neighbouring tiers, worst case across normal/deutan/protan vision:
//     saved↔studied 59.4, studied↔read 10.5 — both clear the ΔE 10 bar.
//   - read↔unread is only 9.7 on wash alone, and deliberately so: `read` is by
//     far the most common state, and a wash strong enough to shout would make
//     every chapter you have ever opened noisy. It's separated by shape instead
//     — `read` carries a left rule (ΔE 61+ against bare page) and `unread` has
//     none — which is a channel that survives any color vision at all.
export const PAPER_TIER = {
  saved: {
    // A marker stripe: saturated, and fading at the right edge the way a real
    // highlighter runs dry at the end of a stroke.
    wash: 'linear-gradient(90deg, rgba(255,196,0,0.55) 0%, rgba(255,205,40,0.48) 88%, rgba(255,205,40,0.18) 100%)',
    rule: '#e0a200',
    dot: '#e0a200',
  },
  studied: {
    wash: 'linear-gradient(90deg, rgba(31,110,130,0.32) 0%, rgba(31,110,130,0.22) 88%, rgba(31,110,130,0.06) 100%)',
    rule: '#1f6e82',
    dot: '#1f6e82',
  },
  read: {
    wash: 'linear-gradient(90deg, rgba(86,66,38,0.15), rgba(86,66,38,0.04))',
    rule: 'rgba(86,66,38,0.5)',
    dot: 'rgba(86,66,38,0.55)',
  },
  unread: {
    wash: 'transparent',
    rule: 'transparent',
    dot: 'transparent',
  },
} as const
