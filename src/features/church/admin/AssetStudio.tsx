import { useEffect, useState } from 'react'
import { useJuice } from '@/juice/useJuice'
import { pickableTemplates, templateFor, type AssetKind } from '@/data/churchAssetTemplates'
import { matchesSource, useChurchAssetsAdmin, type AssetSource } from '@/store/churchAssets'
import { ChurchAssetCard } from '../ChurchAssetCard'
import { assetFilename, postsFramed, renderAssetPng, type ExportFormat } from '@/lib/churchAssetExport'
import { saveImage, shareImage } from '@/lib/postcard'
import { isNativeApp } from '@/lib/appStore'
import type { ChurchAsset } from '@/store/churchAssets'

// The leader's control for ONE visual asset (0133) — a day's verse card, a
// series header, or the live announcement's card. Mounted beside the content it
// is made from (the Schedule's day form, the Notices panel), never as a page of
// its own, because a card is always ABOUT something already on that screen.
//
//   * No card yet → a row of template thumbnails, drawn live from the real
//     words, and "Generate" (add-on only).
//   * A card → the preview, its status, and Approve / Discard / Regenerate.
//     Regenerating over an APPROVED card asks first, because it takes the card
//     off members' screens until approved again (the server's `asset_is_set`).
//   * Out of date (its verse/series/notice changed since) → says so; approval
//     is refused server-side and members never see it, so the one way forward
//     is to regenerate.
//
// A base-tier leader (no add-on) sees nothing to generate, but can still
// approve or discard a card the church already made — the text drafts' rule.
// The template thumbnails render the stored words too, so "what will this look
// like" is answered before anything is created.

const KIND_LABEL: Record<AssetKind, string> = {
  verse_card: 'Verse card',
  series_header: 'Series graphic',
  announcement: 'Notice card',
}

const REASONS: Record<string, string> = {
  no_addon: 'Graphics are part of the Content Generation package, which this church doesn’t have.',
  not_verified: 'This isn’t available for your church right now.',
  not_leadership: 'Only this church’s leadership can do that.',
  no_source: 'Save the day first — a card is made from what’s saved.',
  no_announcement: 'Post a notice first — the card is made from the live notice.',
  stale: 'This card is out of date — regenerate it from what’s saved now.',
  bad_template: 'That template can’t be used for this kind of card.',
  unavailable: 'Couldn’t reach the server — check your connection and try again.',
}

export function AssetStudio({
  churchId,
  source,
  canGenerate,
  preview,
}: {
  churchId: string
  source: AssetSource
  /** The Content Generation add-on. */
  canGenerate: boolean
  /** The words a new card would carry, for live thumbnails before generating. */
  preview: Record<string, unknown>
}) {
  const juice = useJuice()
  const assets = useChurchAssetsAdmin((s) => s.assets)
  const failed = useChurchAssetsAdmin((s) => s.failed)
  const load = useChurchAssetsAdmin((s) => s.load)
  const generate = useChurchAssetsAdmin((s) => s.generate)
  const approve = useChurchAssetsAdmin((s) => s.approve)
  const discard = useChurchAssetsAdmin((s) => s.discard)
  const templates = pickableTemplates(source.kind)
  const [template, setTemplate] = useState(templates[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [armed, setArmed] = useState<'replace' | 'discard' | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [picking, setPicking] = useState(false)

  useEffect(() => { void load(churchId) }, [churchId, load])

  const asset = assets?.find((a) => matchesSource(a, source)) ?? null
  useEffect(() => { setArmed(null); setMsg(null); setPicking(false) }, [asset?.id, source.kind, sourceKey(source)])
  useEffect(() => { if (asset) setTemplate(templateFor(asset.templateId, source.kind).id) }, [asset?.id, asset?.templateId, source.kind])

  if (failed) return null
  if (!assets) return <div className="skeleton" style={{ height: 60, borderRadius: 12 }} />
  if (!asset && !canGenerate) return null

  const run = async (fn: () => Promise<{ ok: boolean; reason?: string }>, done: string) => {
    setBusy(true)
    setMsg(null)
    const r = await fn()
    setBusy(false)
    setArmed(null)
    if (!r.ok) return setMsg({ ok: false, text: REASONS[(r as { reason: string }).reason] ?? REASONS.unavailable })
    juice.select?.()
    setMsg({ ok: true, text: done })
  }

  const doGenerate = () => {
    const replacing = asset?.status === 'approved'
    if (replacing && armed !== 'replace') { setArmed('replace'); return }
    void run(() => generate(churchId, source, template, replacing), 'Made as a draft — your members won’t see it until you approve it.')
    setPicking(false)
  }

  const showPicker = canGenerate && (!asset || picking)

  return (
    <div className="card" style={{ padding: 12, display: 'grid', gap: 10, background: 'var(--card-raised)' }} aria-label={KIND_LABEL[source.kind]}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <b style={{ flex: 1, fontSize: 13 }}>🖼 {KIND_LABEL[source.kind]}</b>
        {asset && <StatusPill status={asset.stale ? 'stale' : asset.status} />}
      </div>

      {asset && !picking && (
        <div style={{ maxWidth: source.kind === 'verse_card' ? 260 : 360 }}>
          <ChurchAssetCard kind={asset.kind} templateId={asset.templateId} payload={asset.payload} placeholderTag />
        </div>
      )}

      {asset?.kind === 'verse_card' && asset.sourceStatus === 'draft' && !asset.stale && (
        <p className="faint" style={{ margin: 0, fontSize: 11.5 }}>
          This day’s verse is still a draft — the card reaches members only once the verse is approved too.
        </p>
      )}
      {asset?.stale && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--coral)' }}>
          Out of date — what it was made from has changed since. Members never see an out-of-date card.
          {canGenerate ? ' Regenerate it to match.' : ''}
        </p>
      )}

      {showPicker && (
        <>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-dim)' }}>Choose a look</span>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(templates.length, 3)}, minmax(0, 1fr))`, gap: 8 }}>
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => setTemplate(t.id)}
                aria-pressed={template === t.id}
                style={{
                  padding: 4, borderRadius: 12, cursor: 'pointer', minWidth: 0, display: 'grid', gap: 4,
                  background: template === t.id ? 'var(--select)' : 'transparent',
                  boxShadow: template === t.id ? '0 0 0 2px var(--ink-dim)' : 'inset 0 0 0 1px var(--edge)',
                  color: 'inherit', font: 'inherit',
                }}
              >
                <ChurchAssetCard kind={source.kind} templateId={t.id} payload={asset?.payload ?? preview} label={t.name} />
                <span style={{ fontSize: 11, fontWeight: 700 }}>{t.name}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {asset && !picking && asset.status === 'approved' && !asset.stale && asset.sourceStatus !== 'draft' && <ExportRow asset={asset} />}

      {msg && <p style={{ margin: 0, fontSize: 12.5, color: msg.ok ? 'var(--mint)' : 'var(--coral)' }}>{msg.text}</p>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {showPicker && (
          <button className="pill" disabled={busy || !template} onClick={doGenerate} style={{ fontWeight: 800, borderColor: 'var(--gold)', color: 'var(--gold)' }}>
            {busy ? 'Making…' : armed === 'replace' ? 'Tap again — this takes the approved card down until you approve again' : asset ? 'Use this look' : `Generate ${KIND_LABEL[source.kind].toLowerCase()}`}
          </button>
        )}
        {asset && asset.status === 'draft' && !asset.stale && !picking && (
          <button className="pill" disabled={busy} onClick={() => void run(() => approve(churchId, asset.id), 'Approved — members see it with the content it was made from.')} style={{ fontWeight: 800 }}>
            Approve
          </button>
        )}
        {asset && canGenerate && !picking && (
          <button className="pill" disabled={busy} onClick={() => (asset.stale ? doGenerate() : setPicking(true))}>
            {asset.stale ? (armed === 'replace' ? 'Tap again to regenerate' : 'Regenerate') : 'Change look'}
          </button>
        )}
        {picking && <button className="pill" disabled={busy} onClick={() => setPicking(false)}>Cancel</button>}
        {asset && !picking && (
          <button
            className="pill"
            disabled={busy}
            onClick={() => (armed === 'discard' ? void run(() => discard(churchId, asset.id), 'Discarded.') : setArmed('discard'))}
          >
            {armed === 'discard' ? 'Tap again to discard' : 'Discard'}
          </button>
        )}
      </div>
    </div>
  )
}

function StatusPill({ status }: { status: 'draft' | 'approved' | 'stale' }) {
  const label = status === 'approved' ? '✓ Approved' : status === 'stale' ? 'Out of date' : '✎ Draft'
  const color = status === 'approved' ? 'var(--mint)' : status === 'stale' ? 'var(--coral)' : 'var(--ink-dim)'
  return <span style={{ fontSize: 11, fontWeight: 800, color }}>{label}</span>
}

function sourceKey(s: AssetSource): string {
  return s.kind === 'verse_card' ? s.date : s.kind === 'series_header' ? s.series : s.announcementId
}

// Take an APPROVED card off the app: a PNG drawn in this browser
// (lib/churchAssetExport.ts), handed to the share sheet or saved as a file.
// Only here, on the leadership screen, and only for a card members can already
// see — never a draft, never an out-of-date card, never a verse card whose day
// is still a draft. Nothing is stored or uploaded; posting it anywhere is the
// leader's own act, outside the app, which is what keeps the cards themselves
// congregation-only.
function ExportRow({ asset }: { asset: ChurchAsset }) {
  const juice = useJuice()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [format, setFormat] = useState<ExportFormat>('post')
  const canShareFiles = isNativeApp() || (typeof navigator !== 'undefined' && !!navigator.share)

  const go = async (how: 'share' | 'save') => {
    juice.select?.()
    setBusy(true)
    setNote(null)
    const blob = await renderAssetPng(asset.kind, asset.templateId, asset.payload, format)
    if (!blob) {
      setBusy(false)
      return setNote({ ok: false, text: 'Couldn’t make the image on this device. Try again, or from another browser.' })
    }
    const name = `${assetFilename(asset.kind, asset.payload)}${format === 'story' ? '-story' : ''}`
    const church = typeof asset.payload.church_name === 'string' ? asset.payload.church_name : 'Our church'
    const r = how === 'save' ? saveImage(blob, name) : await shareImage(blob, { filename: name, title: church, text: '' })
    setBusy(false)
    if (r === 'failed') setNote({ ok: false, text: 'Couldn’t share it just now. Try again in a moment.' })
    else if (r === 'saved') setNote({ ok: true, text: 'Saved as an image — ready to post.' })
  }

  return (
    <div style={{ display: 'grid', gap: 6, borderTop: '1px solid var(--edge)', paddingTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-dim)', marginRight: 2 }}>Post it</span>
        {(['post', 'story'] as const).map((f) => (
          <button
            key={f}
            className="pill"
            aria-pressed={format === f}
            onClick={() => { setFormat(f); setNote(null) }}
            style={{ fontSize: 11.5, padding: '3px 10px', ...(format === f ? { background: 'var(--select)', color: 'var(--ink)' } : {}) }}
          >
            {f === 'post' ? `Post · ${postsFramed(asset.templateId, asset.kind) ? '4:5' : templateFor(asset.templateId, asset.kind).aspect.join(':')}` : 'Story · 9:16'}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {canShareFiles && (
          <button className="pill" disabled={busy} onClick={() => void go('share')} style={{ fontWeight: 800 }}>
            {busy ? 'Making…' : 'Share image'}
          </button>
        )}
        {!isNativeApp() && (
          <button className="pill" disabled={busy} onClick={() => void go('save')}>
            {busy && !canShareFiles ? 'Making…' : 'Download PNG'}
          </button>
        )}
      </div>
      <span className="faint" style={{ fontSize: 11, lineHeight: 1.4 }}>
        {note ? <span style={{ color: note.ok ? 'var(--mint)' : 'var(--coral)' }}>{note.text}</span>
          : format === 'story' ? 'Sized for Instagram and Facebook Stories, with the card clear of the parts the app covers.' : 'A full-size image for Instagram, Facebook or your slides. Posting it is up to you — in the app it stays with your congregation.'}
      </span>
    </div>
  )
}
