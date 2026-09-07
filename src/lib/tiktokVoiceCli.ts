// tiktokVoiceCli — the browser half of scripts/tiktok-voice.mjs.
//
// The operator's-voice loop, driven from a terminal (or from a Claude Code
// session) rather than from the dashboard card: the drafts for a week, a
// phone memo listened to and parked, the verse post rendered with that
// recording. Same generators as the dashboard and the morning runner
// (features/admin/tiktok/make.ts, lib/tiktokVoice.ts) opened in headless
// Chromium by the script, which serves the page, proxies the function with
// the runner token and catches the finished video as a download — the shape
// lib/tiktokDaily.ts already has. Never imported by the app.

import { setRunnerToken, parkFile, fetchCopy, fetchThought, fetchStoryWord, fetchVoice, publicUrl, existsAt, voiceWavPath, voiceJsonPath, type VoiceKind } from '@/features/admin/tiktok/shared'
import { makeVerse, makeStory, type Progress } from '@/features/admin/tiktok/make'
import { getVerseForDate } from '@/data/bible/questions'
import type { TimedWord } from '@/lib/tiktokRender'
import { env as tfEnv } from '@huggingface/transformers'

export interface DraftPart { text: string; words: number; source: string; recorded: boolean; listened: boolean }
export interface DraftRow { date: string; reference: string; verse: string; verseWord: DraftPart; storyWord: DraftPart | null; storyPlace: 'open' | 'close' }
export interface ListenResult { seconds: number; verseMatched: number; verseWords: number; verseEnd: number; thoughtStart: number; thoughtWords: number; text: string }
export interface RenderResult { ext: 'mp4' | 'webm'; size: number; reference: string; tier: string; seconds: number; phrases: number }
export interface FixResult { words: number; heard: number; text: string }

declare global {
  interface Window {
    vaVoice: {
      drafts: (dates: string[], token: string, force?: boolean, place?: 'open' | 'close') => Promise<DraftRow[]>
      hear: (wavUrl: string, token: string) => Promise<{ seconds: number; words: TimedWord[]; text: string }>
      listen: (date: string, wavUrl: string, token: string, kind?: VoiceKind, place?: 'open' | 'close') => Promise<ListenResult>
      render: (date: string, token: string, kind?: VoiceKind, place?: 'open' | 'close') => Promise<RenderResult>
      fix: (date: string, text: string, token: string, kind?: VoiceKind) => Promise<FixResult>
      identify: (wavUrl: string, dates: string[], token: string) => Promise<{ best: { date: string; reference: string; matched: number; words: number } | null; opening: string }>
    }
    __progress: string
    __vaModelBase?: string
    __vaLocalFonts?: boolean
  }
}

function localModels() {
  const base = window.__vaModelBase
  if (!base) return
  tfEnv.allowRemoteModels = false
  tfEnv.allowLocalModels = true
  tfEnv.localModelPath = `${base}/models/`
  const onnx = tfEnv.backends.onnx as { wasm?: { wasmPaths?: string } } | undefined
  if (onnx?.wasm) onnx.wasm.wasmPaths = `${base}/ort/`
}

function ensureFont() {
  if (document.getElementById('va-tiktok-font')) return
  if (window.__vaLocalFonts && window.__vaModelBase) {
    const style = document.createElement('style')
    style.id = 'va-tiktok-font'
    style.textContent = [700, 800].map((w) => `@font-face{font-family:'Baloo 2';font-weight:${w};src:url('${window.__vaModelBase}/fonts/baloo2-${w}.ttf') format('truetype')}`).join('\n')
    document.head.appendChild(style)
    return
  }
  const link = document.createElement('link')
  link.id = 'va-tiktok-font'
  link.rel = 'stylesheet'
  link.href = 'https://fonts.googleapis.com/css2?family=Baloo+2:wght@700;800&display=swap'
  document.head.appendChild(link)
}

const say = (s: string) => { window.__progress = s }

window.vaVoice = {
  /**
   * The week's verses with BOTH of a day's readings under each: the morning
   * thought that follows the verse, and the operator's half of the evening
   * story — its closing word by default, or the INTRODUCTION that hands over
   * to Tabitha when `place` is 'open'. Drafting either of the second pair
   * generates that day's story if it has not been told yet — both are
   * written from the telling, so neither can exist before one — and fails
   * closed to no word rather than costing the whole row.
   */
  async drafts(dates, token, force = false, place = 'close') {
    setRunnerToken(token)
    const out: DraftRow[] = []
    const part = async (date: string, kind: VoiceKind, draft: () => Promise<{ text: string; words: number; source: string }>): Promise<DraftPart> => {
      const t = await draft()
      const listened = !!(await fetchVoice(date, kind).catch(() => null))
      const recorded = listened || (await existsAt(publicUrl(voiceWavPath(date, kind)) + '?v=' + Date.now(), 'audio/'))
      return { text: t.text, words: t.words, source: t.source, recorded, listened }
    }
    for (const date of dates) {
      say(`drafting ${date}`)
      const v = getVerseForDate(date)
      const verseWord = await part(date, 'verse', () => fetchThought(date, force))
      say(`drafting ${date} · the story's ${place === 'open' ? 'introduction' : 'closing word'}`)
      const storyWord = await part(date, 'story', () => fetchStoryWord(date, force, [], place)).catch(() => null)
      out.push({ date, reference: v.reference, verse: v.text, verseWord, storyWord, storyPlace: place })
    }
    return out
  },

  /**
   * Listen to a recording and hand back its words with their timings —
   * parking nothing, deciding nothing. It exists for a BATCH: one memo
   * holding a fortnight of takes is transcribed ONCE here and cut up by the
   * script, rather than fourteen separate Whisper runs over the same five
   * minutes. Every take's track is then derived from this one pass, so the
   * timings inside a take are the ones actually heard.
   */
  async hear(wavUrl, token) {
    setRunnerToken(token)
    localModels()
    const m = await import('@/lib/tiktokVoice')
    say('decoding')
    const dec = await m.decodeRecording(await (await fetch(wavUrl)).blob())
    const track = await m.transcribeOwn(dec.samples, dec.sampleRate, 'close', say)
    return { seconds: dec.seconds, words: track.heard, text: track.text }
  },

  /**
   * A recording (served by the script as a WAV): decoded, parked, listened
   * to, its transcript parked, the day's copy rewritten. A VERSE recording
   * is his reading followed by his thought, so the verse has to be found
   * inside it; the operator's own half of a STORY is all thought, and there
   * is no verse in it to look for — only which end of the telling it belongs
   * at, which is parked with it.
   */
  async listen(date, wavUrl, token, kind = 'verse', place = 'close') {
    setRunnerToken(token)
    localModels()
    const m = await import('@/lib/tiktokVoice')
    say('decoding')
    const dec = await m.decodeRecording(await (await fetch(wavUrl)).blob())
    say('parking the recording')
    await parkFile(voiceWavPath(date, kind), dec.wav, 'audio/wav')
    const v = getVerseForDate(date)
    const track = kind === 'story'
      ? await m.transcribeOwn(dec.samples, dec.sampleRate, place, say)
      : await m.splitRecording(dec.samples, dec.sampleRate, v.text, v.reference, say)
    const fixed = m.refit(track, track.text)
    say('parking the transcript')
    await parkFile(voiceJsonPath(date, kind), new Blob([JSON.stringify(fixed)], { type: 'application/json' }), 'application/json')
    say('rewriting the caption')
    try { await fetchCopy(date, kind, true) } catch { /* written at render time otherwise */ }
    return { seconds: dec.seconds, verseMatched: fixed.verseMatched, verseWords: fixed.verse.length, verseEnd: fixed.verse[fixed.verse.length - 1]?.end ?? 0, thoughtStart: fixed.thought[0]?.start ?? 0, thoughtWords: fixed.thought.length, text: fixed.text }
  },

  /**
   * The operator's corrected thought put back onto the timings Whisper
   * heard, and re-parked. Whisper writes a phone memo down well enough to
   * time it and not well enough to CAPTION it — one week's batch came back
   * with "Gobbliness", "the constant price" for "the constant Christ" and a
   * gold "septic" for a gold scepter — and these words are burned onto the
   * screen. `refit` needs no model and no second listen: it matches the
   * corrected words against `heard` and keeps every timing, so a correction
   * costs nothing and cannot drift the captions off the voice.
   */
  async fix(date, text, token, kind = 'verse') {
    setRunnerToken(token)
    const parked = await fetchVoice(date, kind)
    if (!parked || !Array.isArray(parked.heard) || !parked.heard.length) throw new Error(`nothing listened to for ${date} ${kind} yet — run listen first`)
    const m = await import('@/lib/tiktokVoice')
    const fixed = m.refit(parked, text)
    await parkFile(voiceJsonPath(date, kind), new Blob([JSON.stringify(fixed)], { type: 'application/json' }), 'application/json')
    say('rewriting the caption')
    try { await fetchCopy(date, kind, true) } catch { /* written at render time otherwise */ }
    return { words: fixed.thought.length, heard: parked.heard.length, text: fixed.text }
  },

  /** Which of the coming days a memo is for: its first half-minute against each day's verse. */
  async identify(wavUrl, dates, token) {
    setRunnerToken(token)
    localModels()
    const m = await import('@/lib/tiktokVoice')
    const a = await import('@/lib/tiktokAlign')
    const dec = await m.decodeRecording(await (await fetch(wavUrl)).blob())
    const head = dec.samples.subarray(0, Math.min(dec.samples.length, Math.round(28 * dec.sampleRate)))
    const heard = await a.transcribe(head, dec.sampleRate, say, 'base')
    let best: { date: string; reference: string; matched: number; words: number } | null = null
    for (const date of dates) {
      const v = getVerseForDate(date)
      const words = v.text.trim().split(/\s+/).filter(Boolean)
      const { matched } = a.fitWords(words, heard, head.length / dec.sampleRate)
      if (!best || matched / words.length > best.matched / best.words) best = { date, reference: v.reference, matched, words: words.length }
    }
    if (best && best.matched / best.words < 0.5) best = null
    return { best, opening: heard.slice(0, 12).map((w) => w.text).join(' ') }
  },

  /**
   * The post for the date, with the parked recording, handed to the script
   * as a download. `place` only decides where a recording NOBODY has
   * listened to yet belongs — one that carries its own wins, so a preview
   * cannot move a word recorded as a closing one to the front.
   */
  async render(date, token, kind = 'verse', place = 'close') {
    setRunnerToken(token)
    ensureFont()
    localModels()
    const progress: Progress = (_f, label) => say(`${date}: ${label}`)
    const m = kind === 'story' ? await makeStory(date, { ownPlace: place }, progress) : await makeVerse(date, {}, progress)
    const a = document.createElement('a')
    a.href = m.url
    a.download = `${kind}-${date}.${m.ext}`
    document.body.appendChild(a)
    a.click()
    say('done')
    const seconds = await new Promise<number>((res) => { const v = document.createElement('video'); v.preload = 'metadata'; v.onloadedmetadata = () => res(v.duration); v.onerror = () => res(0); v.src = m.url })
    // The caption count, because a post that renders perfectly with the
    // wrong words on it is the failure this loop keeps finding: a story
    // whose own half was captioned in Tabitha's last phrase looked flawless in
    // every frame and said the wrong thing for fourteen seconds.
    return { ext: m.ext === 'mp4' ? 'mp4' : 'webm', size: m.size, reference: m.reference, tier: m.tier, seconds, phrases: (m.phrases ?? []).length }
  },
}
