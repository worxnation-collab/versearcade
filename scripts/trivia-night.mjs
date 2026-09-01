// Church trivia night — a host pack, generated from the app's own question set.
//
// WHY THIS EXISTS, and why it is a script rather than a feature. A hosted
// trivia night is the most promising thing anyone has proposed selling to a
// CHURCH (see the sponsored slot and the custom church skin for the two
// products already sold that way — money off the device, operator grant, no
// storefront). But the in-app version of it is a live N-player room with a
// projector view, which is the largest single build since the church system.
//
// The questions already exist: 406 of them across all 66 books. So the cheap
// way to find out whether a church would pay for the room is to hand one a
// night they can run TONIGHT, with a laptop and whatever screen is in the hall,
// and see whether they ask for it again. This produces that night.
//
// It is deliberately throwaway. Nothing in the app imports it, it is not in the
// build chain, and if the answer comes back "no" it costs one file to delete.
//
//   node scripts/trivia-night.mjs                  # a night, to ./trivia-night.html
//   node scripts/trivia-night.mjs --seed 7         # a DIFFERENT night, reproducibly
//   node scripts/trivia-night.mjs --out ~/pack.html
//
// The output is ONE self-contained HTML file — no network, no fonts to install,
// no PowerPoint. It opens from a USB stick on a borrowed laptop, which is the
// actual deployment environment. It holds three things:
//
//   • the projector deck (arrow keys; question, then answer + the fact)
//   • the host script, to print — every answer and every fact on paper, so the
//     host is never reading off the screen the room is looking at
//   • team answer sheets, to print
//
// The reveal carrying the teach line is the whole pitch. A pub quiz tells you
// that you were wrong; this tells the room something true either way, which is
// the rule the app is built on and the reason trivia can exist in it at all.

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const TRIVIA = resolve(here, '../src/data/bible/trivia.ts')
const POOL = resolve(here, '../src/data/bible/pool.ts')

// --- args -------------------------------------------------------------------
const args = process.argv.slice(2)
const argOf = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 || i === args.length - 1 ? fallback : args[i + 1]
}
const SEED = String(argOf('seed', '1'))
const OUT = resolve(process.cwd(), argOf('out', 'trivia-night.html'))
const PER_ROUND = Number(argOf('questions', '8'))

// --- read the data ----------------------------------------------------------
// Same trick the checkers use: these are data files holding one big literal, so
// slice it out and evaluate it rather than dragging in a TS toolchain.
function literalAfter(src, marker, open, close, file) {
  const at = src.indexOf(marker)
  if (at === -1) throw new Error(`${file}: could not find ${marker}`)
  const eq = src.indexOf(`= ${open}`, at)
  if (eq === -1) throw new Error(`${file}: ${marker} is not assigned a ${open}${close} literal`)
  const start = eq + 2
  let depth = 0
  for (let i = start; i < src.length; i++) {
    if (src[i] === open) depth++
    else if (src[i] === close && --depth === 0) return new Function(`return ${src.slice(start, i + 1)}`)()
  }
  throw new Error(`${file}: unbalanced ${open}${close} after ${marker}`)
}

const BOOK_TRIVIA = literalAfter(await readFile(TRIVIA, 'utf8'), 'export const BOOK_TRIVIA', '{', '}', 'trivia.ts')
const BIBLE_BOOKS = literalAfter(await readFile(POOL, 'utf8'), 'export const BIBLE_BOOKS', '[', ']', 'pool.ts')

// --- seeded shuffle (the app's mulberry32, so a seed reproduces a night) -----
function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function hashString(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
const rng = mulberry32(hashString(`trivia-night-${SEED}`))
const shuffled = (arr) => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}

// --- the running order ------------------------------------------------------
// Five rounds across the whole Bible, so no single tradition's favourite
// section decides the night and nobody is shut out of a whole round.
const at = (a, b) => BIBLE_BOOKS.slice(BIBLE_BOOKS.indexOf(a), BIBLE_BOOKS.indexOf(b) + 1)
const ROUNDS = [
  { title: 'In the Beginning', blurb: 'The five books of Moses', books: at('Genesis', 'Deuteronomy') },
  { title: 'Kings, Judges and Prophets', blurb: 'From Joshua to Malachi', books: [...at('Joshua', 'Esther'), ...at('Isaiah', 'Malachi')] },
  { title: 'The Life of Jesus', blurb: 'The four Gospels', books: at('Matthew', 'John') },
  { title: 'The Early Church', blurb: 'Acts, the letters and Revelation', books: at('Acts', 'Revelation') },
  { title: 'Wisdom and Songs', blurb: 'Job, Psalms, Proverbs and more', books: at('Job', 'Song of Solomon') },
]

const used = new Set()
const rounds = ROUNDS.map((r) => {
  const pool = shuffled(r.books.flatMap((b) => (BOOK_TRIVIA[b] ?? []).map((q) => ({ ...q, book: b }))))
  const picked = []
  for (const q of pool) {
    if (picked.length >= PER_ROUND) break
    if (used.has(q.id)) continue
    used.add(q.id)
    // Shuffle the options once, here, so paper and projector agree forever.
    const answer = q.options[q.answerIndex]
    const options = shuffled(q.options)
    picked.push({ ...q, options, answerIndex: options.indexOf(answer) })
  }
  return { ...r, questions: picked }
})

const thin = rounds.filter((r) => r.questions.length < PER_ROUND)
if (thin.length) {
  console.warn(`! short rounds: ${thin.map((r) => `${r.title} (${r.questions.length})`).join(', ')}`)
}
const TOTAL = rounds.reduce((n, r) => n + r.questions.length, 0)

// --- render -----------------------------------------------------------------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const LETTERS = ['A', 'B', 'C', 'D']

// Every slide is a section; the deck shows exactly one at a time.
const slides = []
slides.push(`<section class="slide title">
  <div class="kicker">Verse Arcade</div>
  <h1>Bible Trivia Night</h1>
  <p class="sub">${TOTAL} questions · ${rounds.length} rounds</p>
  <p class="hint">Press <kbd>→</kbd> to begin · <kbd>F</kbd> for full screen</p>
</section>`)

rounds.forEach((r, ri) => {
  slides.push(`<section class="slide title">
    <div class="kicker">Round ${ri + 1} of ${rounds.length}</div>
    <h1>${esc(r.title)}</h1>
    <p class="sub">${esc(r.blurb)} · ${r.questions.length} questions</p>
  </section>`)
  r.questions.forEach((q, qi) => {
    const opts = q.options.map((o, i) => `<li><b>${LETTERS[i]}</b><span>${esc(o)}</span></li>`).join('')
    slides.push(`<section class="slide q">
      <div class="kicker">Round ${ri + 1} · Question ${qi + 1}</div>
      <h2>${esc(q.prompt)}</h2>
      <ol class="opts">${opts}</ol>
    </section>`)
    const revealed = q.options
      .map((o, i) => `<li class="${i === q.answerIndex ? 'right' : ''}"><b>${LETTERS[i]}</b><span>${esc(o)}</span></li>`)
      .join('')
    slides.push(`<section class="slide q reveal">
      <div class="kicker">Round ${ri + 1} · Question ${qi + 1} · Answer</div>
      <h2>${esc(q.prompt)}</h2>
      <ol class="opts">${revealed}</ol>
      <p class="teach"><b>Good to know</b> ${esc(q.teach)}</p>
    </section>`)
  })
  slides.push(`<section class="slide title">
    <div class="kicker">End of round ${ri + 1}</div>
    <h1>Swap and score</h1>
    <p class="sub">${esc(r.title)} · ${r.questions.length} points on offer</p>
  </section>`)
})
slides.push(`<section class="slide title">
  <div class="kicker">That's the night</div>
  <h1>Thanks for playing</h1>
  <p class="sub">Every one of these questions is in Verse Arcade, free, every day.</p>
</section>`)

const hostScript = rounds.map((r, ri) => `
  <section class="sheet">
    <h2>Round ${ri + 1} — ${esc(r.title)}</h2>
    <p class="sheet-sub">${esc(r.blurb)}</p>
    <ol class="host">
      ${r.questions.map((q) => `<li>
        <p class="hq">${esc(q.prompt)}</p>
        <p class="ha">${q.options.map((o, i) => `${i === q.answerIndex ? `<b>${LETTERS[i]}. ${esc(o)}</b>` : `${LETTERS[i]}. ${esc(o)}`}`).join(' &nbsp;·&nbsp; ')}</p>
        <p class="ht">Read out after: ${esc(q.teach)}</p>
      </li>`).join('')}
    </ol>
  </section>`).join('')

const answerSheet = `
  <section class="sheet">
    <h2>Team answer sheet</h2>
    <p class="sheet-sub">Team name: ______________________________</p>
    <div class="grid">
      ${rounds.map((r, ri) => `<div class="col">
        <h3>Round ${ri + 1}</h3>
        <p class="col-sub">${esc(r.title)}</p>
        ${r.questions.map((_, qi) => `<div class="row"><span>${qi + 1}</span><i></i></div>`).join('')}
      </div>`).join('')}
    </div>
  </section>`

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bible Trivia Night — host pack</title>
<style>
  :root{
    --bg-0:#0b0720; --bg-2:#1e0f47; --ink:#fff; --ink-dim:#b8a9e0; --ink-faint:#7a6ba8;
    --gold:#ffd23f; --grape:#a06bff; --good:#43e97b; --card:#241353; --stroke:rgba(255,255,255,.14);
    --display:'Baloo 2','Fredoka',system-ui,-apple-system,'Segoe UI',sans-serif;
  }
  *{box-sizing:border-box}
  html,body{margin:0;height:100%}
  body{background:var(--bg-0);color:var(--ink);font:16px/1.5 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
    overflow:hidden;display:flex;flex-direction:column}

  /* ── projector deck ──
     The bar is a SIBLING that takes its own height, not a fixed overlay. It was
     an overlay first, and on a 720p projector the answer slide's teach line —
     the whole point of the reveal — sat underneath it, cut in half. A hall full
     of people would have seen that before anyone here did. */
  #deck{flex:1;position:relative;min-height:0}
  .slide{position:absolute;inset:0;display:none;flex-direction:column;justify-content:center;
    padding:4vh 6vw;background:radial-gradient(120% 90% at 50% 0%,var(--bg-2),var(--bg-0))}
  .slide.on{display:flex}
  .kicker{font:800 clamp(12px,min(1.7vw,2.6vh),22px)/1 var(--display);letter-spacing:.16em;text-transform:uppercase;color:var(--ink-faint);margin-bottom:3vh}
  .slide.title h1{font:800 clamp(32px,min(8vw,13vh),110px)/1.05 var(--display);margin:0;
    background:linear-gradient(180deg,#fff,var(--gold));-webkit-background-clip:text;background-clip:text;color:transparent}
  .sub{font:600 clamp(15px,min(2.4vw,4vh),32px)/1.4 var(--display);color:var(--ink-dim);margin:3vh 0 0}
  .hint{color:var(--ink-faint);margin-top:5vh;font-size:clamp(11px,min(1.4vw,2.2vh),18px)}
  kbd{background:var(--card);border:1px solid var(--stroke);border-radius:6px;padding:1px 7px;font:inherit}
  /* Every size is capped on HEIGHT as well as width. Clamping on vw alone made
     a wide-but-short window — a host who opens this on a laptop and never
     presses F — render big type with no room for it: seven slides overflowed by
     16px at 1440x600. min(vw, vh) is what makes the deck fit whatever screen
     the hall turns out to have. */
  .q h2{font:800 clamp(20px,min(4vw,7vh),56px)/1.18 var(--display);margin:0 0 3vh}
  .opts{list-style:none;margin:0;padding:0;display:grid;gap:1.3vh}
  .opts li{display:flex;align-items:center;gap:2vw;background:var(--card);border:2px solid var(--stroke);
    border-radius:16px;padding:1.5vh 2.2vw;font:700 clamp(15px,min(2.6vw,4.4vh),36px)/1.25 var(--display)}
  .opts li b{color:var(--gold);min-width:1.4em;font-family:var(--display)}
  .opts li.right{background:linear-gradient(180deg,#2f9b5c,#1b6d3f);border-color:var(--good)}
  .opts li.right b{color:#fff}
  /* The reveal holds a question, four options AND the fact. Tightened so the
     worst case — a long question over a long teach line — still fits a 16:9
     projector at 720p without anything being cut off. */
  .reveal h2{font:800 clamp(17px,min(3vw,4.6vh),40px)/1.15 var(--display);margin:0 0 2vh}
  .reveal .kicker{margin-bottom:1.6vh}
  .reveal .opts{gap:.9vh}
  .reveal .opts li{padding:1.1vh 2.2vw;font-size:clamp(13px,min(2.1vw,3.2vh),28px)}
  .teach{margin:2.4vh 0 0;padding:1.6vh 2.2vw;border-left:5px solid var(--gold);background:rgba(255,210,63,.09);
    border-radius:0 14px 14px 0;font-size:clamp(12px,min(1.6vw,2.6vh),22px);line-height:1.4;color:var(--ink-dim)}
  .teach b{display:block;color:var(--gold);font-family:var(--display);letter-spacing:.08em;
    text-transform:uppercase;font-size:.62em;margin-bottom:.4em}

  #bar{flex:0 0 auto;display:flex;align-items:center;gap:14px;
    padding:10px 16px;background:rgba(0,0,0,.45);border-top:1px solid var(--stroke);font-size:13px;color:var(--ink-dim)}
  #bar button{font:inherit;font-weight:700;background:var(--card);color:var(--ink);border:1px solid var(--stroke);
    border-radius:999px;padding:7px 14px;cursor:pointer}
  #bar button:hover{border-color:var(--gold)}
  #pos{margin-left:auto;font-variant-numeric:tabular-nums}

  /* ── print: the paper half. Never both at once. ── */
  #paper{display:none}
  @media print{
    body{background:#fff;color:#000;overflow:visible;font-size:11pt}
    #deck,#bar{display:none!important}
    #paper{display:block}
    .sheet{page-break-after:always;padding:0}
    .sheet h2{font-size:17pt;margin:0 0 2pt}
    .sheet-sub{color:#555;margin:0 0 14pt;font-size:10pt}
    ol.host{padding-left:18pt}
    ol.host li{margin-bottom:11pt;page-break-inside:avoid}
    .hq{font-weight:700;margin:0 0 3pt}
    .ha{margin:0 0 3pt}
    .ht{margin:0;color:#444;font-style:italic;font-size:9.5pt}
    .grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10pt}
    .col h3{margin:0;font-size:11pt}
    .col-sub{margin:0 0 6pt;color:#555;font-size:8pt}
    .row{display:flex;align-items:center;gap:6pt;margin-bottom:5pt}
    .row span{width:14pt;text-align:right;color:#666;font-size:9pt}
    .row i{flex:1;height:15pt;border:1px solid #999;border-radius:3px}
  }
  body.printing{overflow:visible}
</style>
</head>
<body>
<div id="deck">${slides.join('\n')}</div>

<div id="bar">
  <button onclick="go(-1)">‹ Back</button>
  <button onclick="go(1)">Next ›</button>
  <button onclick="full()">Full screen</button>
  <button onclick="window.print()">Print host script + answer sheets</button>
  <span id="pos"></span>
</div>

<div id="paper">${hostScript}${answerSheet}</div>

<script>
  var slides = document.querySelectorAll('#deck .slide'), i = 0
  function show(n){
    i = Math.max(0, Math.min(slides.length - 1, n))
    for (var k = 0; k < slides.length; k++) slides[k].classList.toggle('on', k === i)
    document.getElementById('pos').textContent = (i + 1) + ' / ' + slides.length
  }
  function go(d){ show(i + d) }
  function full(){
    if (document.fullscreenElement) document.exitFullscreen()
    else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen()
  }
  document.addEventListener('keydown', function(e){
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); go(1) }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(-1) }
    else if (e.key === 'f' || e.key === 'F') full()
    else if (e.key === 'Home') show(0)
  })
  show(0)
</script>
</body>
</html>`

await writeFile(OUT, html, 'utf8')
console.log(`✓ trivia night (seed ${SEED}): ${TOTAL} questions in ${rounds.length} rounds → ${OUT}`)
rounds.forEach((r, i) => console.log(`   ${i + 1}. ${r.title} — ${r.questions.length}`))
