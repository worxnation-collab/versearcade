#!/usr/bin/env node
// A painted backdrop for ONE VERSE, generated ahead of the schedule.
//
//   node scripts/tiktok-scenes.mjs 2026-09-12 --days=14
//   node scripts/tiktok-scenes.mjs --refs="John 3:16,Psalm 23:1"
//   node scripts/tiktok-scenes.mjs 2026-09-12 --days=7 --dry     # prompts only
//   node scripts/tiktok-scenes.mjs 2026-09-12 --days=7 --force   # redo parked ones
//
// WHY a scene per verse rather than a set to choose from. The engine already
// has two fixed sets — nine road paintings picked by rotation, ten story
// stages picked by Gemini from a prepack — and both were built when the
// backdrop only had to be somewhere plausible. It shows: the reader stood on a
// wheat field while the verse was Esther walking into the throne room. The
// obvious fix is a bigger prepack keyed on the verse's THEME, and that does
// not work: the pool carries 710 distinct themes across 726 verses, so the
// theme is very nearly a primary key. There is nothing to group by. A backdrop
// that genuinely matches the words has to be made for the words.
//
// WHY the bucket rather than the repo. `public/` is compiled into `dist`,
// which is baked into the IPA, so 726 JPEGs would ship inside the app — the
// Study library's single painting mattered at 166KB. These park in the
// `tiktok` Storage bucket at `scenes/<slug>.jpg`, which is the same trick
// seasonal skin art uses: art that reaches a post without a release.
//
// WHY it is a BATCH and not part of the morning run. The cron has to finish;
// a two-call generation per post, against an image API that answers 503 under
// load and is not retried, is not something to put on the path of the one post
// this account is built around. So scenes are made ahead, like the recordings,
// and the renderer FAILS CLOSED: no parked scene is the road rotation exactly
// as before, never a failed post.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { createClient } from '@supabase/supabase-js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, '.tiktok-voice', 'scenes')
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
  const [k, ...v] = a.slice(2).split('='); return [k, v.length ? v.join('=') : true]
}))
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
const fail = (m) => { console.error('tiktok-scenes:', m); process.exit(2) }

const KEY = process.env.GEMINI_API_KEY || ''
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://visuppaucpzzigwtqmdd.supabase.co'
const ANON = process.env.SUPABASE_ANON_KEY || ''
const TOKEN = process.env.TIKTOK_RUNNER_TOKEN || ''
if (!KEY) fail('set GEMINI_API_KEY')
if (!ANON || !TOKEN) fail('set SUPABASE_ANON_KEY and TIKTOK_RUNNER_TOKEN')

const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image'
// Keep these in step with tiktok-gen/index.ts — `gemini-2.5-flash` was retired
// out from under this script and answered 404 on the first real run.
const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-3.6-flash'

/** `John 3:16` → `john-3-16`. Must match the path the function allows. */
export const sceneSlug = (reference) =>
  String(reference).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
export const scenePath = (reference) => `scenes/${sceneSlug(reference)}.jpg`

async function gemini(model, body) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY },
    body: JSON.stringify(body),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`${model} ${r.status}: ${JSON.stringify(j).slice(0, 200)}`)
  return j
}

/**
 * What this verse LOOKS like, written by a model that has read it.
 *
 * Three things the prompt must guarantee and the model must not be trusted to
 * infer, because each one breaks the frame rather than the picture:
 *
 *  - NO PEOPLE. A figure is composited on top; a painted crowd puts a second
 *    person in the shot and the centred character stops being the subject.
 *  - The MIDDLE of the frame is reserved top to bottom, not merely the lower
 *    middle. Clearing only the ground is not enough: the first scene obeyed
 *    that and still put the cross dead centre, so the crossbar came out of the
 *    standing figure's skull. The subject belongs near one edge.
 *  - The TOP THIRD is covered by the caption panel, so nothing that carries
 *    meaning may live up there.
 *
 * **How that middle is ASKED FOR is load-bearing, and it cost two renders.**
 * Saying "reserve the centre column" or "keep the middle third clear" makes an
 * image model draw the geometry it was handed: both attempts came back as two
 * or three flat vertical STRIPES of colour with a literal empty band down the
 * middle, which is not a painting at all. Column, band, third, panel and
 * stripe are all words about the CANVAS, and a picture is not a canvas. What
 * works is a director's note about the SCENE — put the cross over by the left
 * edge, let the rest fall away into open ground — plus an explicit refusal of
 * the failure ("it is ONE continuous scene, no vertical bands or seams"). Keep
 * both halves; the refusal alone let the subject drift back to the middle.
 *
 * The STYLE is shown rather than described (`STYLE_REFS`), for the reason
 * given there.
 */
async function scenePrompt(v) {
  const j = await gemini(TEXT_MODEL, {
    contents: [{ parts: [{ text:
      `Write an image prompt for a painted vertical backdrop illustrating ONE Bible verse.\n\n` +
      `Verse: ${v.reference} — "${v.text}"\n` +
      `Book: ${v.book}. Speaker: ${v.speaker}. Theme: ${v.theme}.\n\n` +
      `Describe the PLACE and the MOMENT this verse comes out of, or — if the verse is a metaphor or a ` +
      `statement rather than an event — the landscape or setting its own images call up. Be specific to THIS ` +
      `verse: somebody who knows it should recognise the scene. Name the time of day, the weather, the terrain ` +
      `and two or three concrete objects that belong to it.\n\n` +
      `Hard rules, all of which must appear in your prompt:\n` +
      `- ABSOLUTELY NO PEOPLE, no figures, no faces, no crowds, no silhouettes, no animals in the foreground.\n` +
      `- COMPOSITION. A standing person is painted into the middle of this image afterwards, so the middle of the ` +
      `frame must be OPEN — plain ground, water, floor or sky — from top to bottom. Place the main subject of the scene ` +
      `(the cross, the tree, the gate, the boat, whatever it is) well off to one side, near the left or right edge, and ` +
      `let the rest fall away into open space. Think of a wide landscape photograph with the subject at one edge and ` +
      `nothing but ground in the middle distance.\n` +
      `- It is ONE continuous scene. Do not divide the canvas. No vertical bands, stripes, panels, columns, blocks of ` +
      `flat colour, borders or seams of any kind — earlier attempts rendered this as two or three flat vertical stripes ` +
      `and were rejected. Ground, horizon and sky run unbroken from edge to edge.\n` +
      `- The LOWER MIDDLE especially must be open, calm and uncluttered — plain ground, water or floor, for the figure to ` +
      `stand on.\n` +
      `- The TOP THIRD must be simple and quiet — open sky or plain shadow — with nothing important in it.\n` +
      `- STYLE, and be emphatic about it: flat graphic vector-like shapes with CLEAN HARD EDGES and DEEP SATURATED colour ` +
      `blocks, in the manner of the two reference images supplied. Rich warm earth tones — burnt orange, ochre, terracotta, ` +
      `deep slate blue. NOT pale, NOT washed out, NOT pastel, NOT hazy, NOT misty, NOT airbrushed, NOT soft-focus, NOT ` +
      `photographic. Bold blocks of colour rather than gentle gradients. No text, no watermark, no border.\n` +
      `- Vertical 9:16 composition.\n\n` +
      `Return ONLY the prompt text, 80-140 words, no preamble and no quotation marks.` }] }],
    generationConfig: { temperature: 0.9 },
  })
  const t = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim()
  if (t.split(/\s+/).length < 40) throw new Error(`scene prompt came back too short: ${t.slice(0, 120)}`)
  return t
}

/**
 * The app's own road paintings, shown to the model as references.
 *
 * Words were not enough and that is the whole reason these are here. The first
 * real scene came back soft, hazy and pale — a perfectly good picture in a
 * different hand from the rest of the account, and a saturated cut-out figure
 * standing on it reads as pasted on rather than painted in. The house style is
 * flat graphic shapes, clean edges and saturated colour blocks, and the
 * quickest way to say that is to show it, exactly as `gen-art.mjs` shows every
 * skin the two starter figures.
 *
 * Roads rather than figures on purpose: a person-shaped reference invites a
 * person into a backdrop whose first rule is that it has none.
 */
const STYLE_REFS = ['public/tiktok/roads/mountain-path.jpg', 'public/tiktok/roads/dawn-hills.jpg']
const b64 = (f) => fs.readFileSync(path.join(ROOT, f)).toString('base64')

async function renderScene(prompt) {
  const refs = STYLE_REFS.filter((f) => fs.existsSync(path.join(ROOT, f)))
    .map((f) => ({ inline_data: { mime_type: 'image/jpeg', data: b64(f) } }))
  const j = await gemini(IMAGE_MODEL, {
    contents: [{ parts: [{ text: prompt }, ...refs] }],
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '9:16', imageSize: '2K' } },
  })
  const part = (j.candidates?.[0]?.content?.parts ?? []).find((p) => p.inline_data ?? p.inlineData)
  const data = (part?.inline_data ?? part?.inlineData)?.data
  if (!data) throw new Error(`no image returned: ${JSON.stringify(j).slice(0, 200)}`)
  return Buffer.from(data, 'base64')
}

async function fn(action, body) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/tiktok-gen`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}`, 'x-runner-token': TOKEN },
    body: JSON.stringify({ action, ...body }),
  })
  const j = await r.json().catch(() => ({ error: `function ${r.status}` }))
  if (j.error) throw new Error(`${action}: ${j.error}`)
  return j
}

const publicUrl = (p) => `${SUPABASE_URL}/storage/v1/object/public/tiktok/${p}`
const parked = async (p) => (await fetch(publicUrl(p), { method: 'HEAD' })).ok

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  await build({
    entryPoints: [path.join(ROOT, 'src/data/bible/questions.ts')], bundle: true, format: 'esm', platform: 'node',
    outfile: path.join(OUT, 'q.mjs'), alias: { '@': path.join(ROOT, 'src') }, logLevel: 'error',
    define: { 'import.meta.env': 'VA_ENV' }, banner: { js: 'const VA_ENV = {};' },
  })
  const { getVerseForDate } = await import(path.join(OUT, 'q.mjs'))

  let verses = []
  if (flags.refs) {
    const { VERSE_POOL } = await import(path.join(OUT, 'q.mjs')).catch(() => ({}))
    const wanted = String(flags.refs).split(',').map((s) => s.trim())
    const pool = VERSE_POOL ?? []
    for (const w of wanted) {
      const v = pool.find((x) => x.reference === w)
      if (v) verses.push(v); else log(`  ${w}: not in the pool, skipped`)
    }
  } else {
    const start = args[0]
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '')) fail('usage: tiktok-scenes <start date> [--days=N] | --refs="A,B"')
    if (flags.days === true) fail('use --days=N')
    const days = Math.max(1, Math.min(120, Number(flags.days) || 14))
    for (let i = 0; i < days; i++) {
      const d = new Date(`${start}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + i)
      verses.push(getVerseForDate(d.toISOString().slice(0, 10)))
    }
  }
  // One verse can land on several dates across a long window; one painting.
  const seen = new Set()
  verses = verses.filter((v) => (seen.has(v.reference) ? false : seen.add(v.reference)))
  log(`${verses.length} verse(s)`)

  let made = 0, had = 0, bad = 0
  for (const v of verses) {
    const p = scenePath(v.reference)
    if (!flags.force && !flags.local && (await parked(p))) { had++; log(`  ${v.reference.padEnd(22)} already parked`); continue }
    try {
      const prompt = await scenePrompt(v)
      if (flags.dry) { log(`  ${v.reference.padEnd(22)} ${prompt.slice(0, 150)}…`); continue }
      const png = await renderScene(prompt)
      const local = path.join(OUT, `${sceneSlug(v.reference)}.jpg`)
      fs.writeFileSync(local, png)
      // `--local` stops at the file, for a preview render that serves the
      // painting off disk rather than the bucket.
      if (flags.local) { made++; log(`  ${v.reference.padEnd(22)} ${(png.length / 1024).toFixed(0)}KB → ${local}`); continue }
      const up = await fn('upload-url', { path: p })
      const sb = createClient(SUPABASE_URL, ANON)
      const { error } = await sb.storage.from('tiktok').uploadToSignedUrl(up.path, up.token, fs.readFileSync(local), {
        contentType: 'image/jpeg', upsert: true,
      })
      if (error) throw new Error(`upload: ${error.message}`)
      made++
      log(`  ${v.reference.padEnd(22)} ${(png.length / 1024).toFixed(0)}KB → ${p}`)
    } catch (e) {
      // The image API answers 503 under load and this does not retry, exactly
      // as gen-art.mjs does not: a failed render is a capacity problem, so the
      // answer is to run the batch again rather than to rewrite a prompt that
      // was fine. Nothing here is required for a post to go out.
      bad++
      log(`  ${v.reference.padEnd(22)} FAILED — ${String(e?.message || e).slice(0, 120)}`)
    }
  }
  log(`${made} made, ${had} already parked, ${bad} failed${bad ? ' (re-run to top up)' : ''}`)
}

main().catch((e) => fail(String(e?.message || e)))
