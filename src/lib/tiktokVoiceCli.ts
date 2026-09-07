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

import { setRunnerToken, parkFile, fetchCopy, fetchThought, fetchVoice, publicUrl, existsAt, voiceWavPath, voiceJsonPath } from '@/features/admin/tiktok/shared'
import { makeVerse, type Progress } from '@/features/admin/tiktok/make'
import { getVerseForDate } from '@/data/bible/questions'
import { env as tfEnv } from '@huggingface/transformers'

export interface DraftRow { date: string; reference: string; verse: string; text: string; words: number; source: string; recorded: boolean; listened: boolean }
export interface ListenResult { seconds: number; verseMatched: number; verseWords: number; verseEnd: number; thoughtStart: number; thoughtWords: number; text: string }
export interface RenderResult { ext: 'mp4' | 'webm'; size: number; reference: string; tier: string; seconds: number }

declare global {
  interface Window {
    vaVoice: {
      drafts: (dates: string[], token: string, force?: boolean) => Promise<DraftRow[]>
      listen: (date: string, wavUrl: string, token: string) => Promise<ListenResult>
      render: (date: string, token: string) => Promise<RenderResult>
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
  /** The week's verses with a drafted thought under each, and what is already parked for the date. */
  async drafts(dates, token, force = false) {
    setRunnerToken(token)
    const out: DraftRow[] = []
    for (const date of dates) {
      say(`drafting ${date}`)
      const v = getVerseForDate(date)
      const t = await fetchThought(date, force)
      const listened = !!(await fetchVoice(date).catch(() => null))
      const recorded = listened || (await existsAt(publicUrl(voiceWavPath(date)) + '?v=' + Date.now(), 'audio/'))
      out.push({ date, reference: v.reference, verse: v.text, text: t.text, words: t.words, source: t.source, recorded, listened })
    }
    return out
  },

  /** A recording (served by the script as a WAV): decoded, parked, listened to, its transcript parked, the day's copy rewritten. */
  async listen(date, wavUrl, token) {
    setRunnerToken(token)
    localModels()
    const v = getVerseForDate(date)
    const m = await import('@/lib/tiktokVoice')
    say('decoding')
    const dec = await m.decodeRecording(await (await fetch(wavUrl)).blob())
    say('parking the recording')
    await parkFile(voiceWavPath(date), dec.wav, 'audio/wav')
    const track = await m.splitRecording(dec.samples, dec.sampleRate, v.text, v.reference, say)
    const fixed = m.refit(track, track.text)
    say('parking the transcript')
    await parkFile(voiceJsonPath(date), new Blob([JSON.stringify(fixed)], { type: 'application/json' }), 'application/json')
    say('rewriting the caption')
    try { await fetchCopy(date, 'verse', true) } catch { /* written at render time otherwise */ }
    return { seconds: dec.seconds, verseMatched: fixed.verseMatched, verseWords: fixed.verse.length, verseEnd: fixed.verse[fixed.verse.length - 1]?.end ?? 0, thoughtStart: fixed.thought[0]?.start ?? 0, thoughtWords: fixed.thought.length, text: fixed.text }
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

  /** The verse post for the date, with the parked recording, handed to the script as a download. */
  async render(date, token) {
    setRunnerToken(token)
    ensureFont()
    localModels()
    const progress: Progress = (_f, label) => say(`${date}: ${label}`)
    const m = await makeVerse(date, {}, progress)
    const a = document.createElement('a')
    a.href = m.url
    a.download = `voice-${date}.${m.ext}`
    document.body.appendChild(a)
    a.click()
    say('done')
    const seconds = await new Promise<number>((res) => { const v = document.createElement('video'); v.preload = 'metadata'; v.onloadedmetadata = () => res(v.duration); v.onerror = () => res(0); v.src = m.url })
    return { ext: m.ext === 'mp4' ? 'mp4' : 'webm', size: m.size, reference: m.reference, tier: m.tier, seconds }
  },
}
