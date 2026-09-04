// tiktokDaily — the browser half of the scheduled runner.
//
// scripts/tiktok-daily.mjs bundles this file, opens it in headless Chromium
// and calls `renderPost` for each of the day's posts. It uses EXACTLY the
// generators the dashboard uses (features/admin/tiktok/make.ts) — the cron
// and the button make the same video — and hands the finished file back to
// the runner as a download, which Playwright catches. The runner then
// transcodes, uploads and schedules; nothing here talks to Ayrshare.
//
// Never imported by the app. It hands the function calls the runner token
// (TIKTOK_RUNNER_TOKEN, Vault 0102) so the Edge Function treats them as the
// admin; in the runner's local mode the function URL is a shim and no token
// is needed.

import { setRunnerToken } from '@/features/admin/tiktok/shared'
import { makeVerse, makeStory, makeQuiz, type Progress } from '@/features/admin/tiktok/make'
import { env as tfEnv } from '@huggingface/transformers'

export type Kind = 'verse' | 'story' | 'quiz'

export interface Rendered {
  kind: Kind
  date: string
  ext: 'mp4' | 'webm'
  size: number
  reference: string
  tier: string
  hook: string | null
}

declare global {
  interface Window {
    versearcadeDaily: { renderPost: (kind: Kind, date: string, token?: string) => Promise<Rendered> }
    __progress: string
    /** Set by the runner when it serves the aligner's model itself (MODELS_DIR). */
    __vaModelBase?: string
    /** …and the display font, from the same directory. */
    __vaLocalFonts?: boolean
  }
}

// A runner with no route to huggingface.co (an egress-filtered sandbox) can
// serve the Whisper files and the ONNX runtime from its own origin instead;
// the dashboard never sets this and fetches them from the web as before.
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

export async function renderPost(kind: Kind, date: string, token?: string): Promise<Rendered> {
  if (token) setRunnerToken(token)
  ensureFont()
  localModels()
  const progress: Progress = (_f, label) => { window.__progress = `${kind} ${date}: ${label}` }
  const m = kind === 'verse' ? await makeVerse(date, {}, progress)
    : kind === 'story' ? await makeStory(date, {}, progress)
    : await makeQuiz(date, {}, progress)
  // Hand the file to the runner: a download is the one channel that carries
  // 20MB out of a page without base64 round-trips.
  const a = document.createElement('a')
  a.href = m.url
  a.download = `${kind}-${date}.${m.ext}`
  document.body.appendChild(a)
  a.click()
  window.__progress = `${kind} ${date}: done`
  return { kind, date, ext: m.ext === 'mp4' ? 'mp4' : 'webm', size: m.size, reference: m.reference, tier: m.tier, hook: m.copy?.hook ?? null }
}

window.versearcadeDaily = { renderPost }
