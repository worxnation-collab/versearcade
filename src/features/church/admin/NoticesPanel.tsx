import { useState } from 'react'
import { AssetStudio } from './AssetStudio'
import { MoreTools } from './MoreTools'
import { Button } from '@/components/Button'
import { useJuice } from '@/juice/useJuice'
import { todayLocalDate } from '@/lib/date'
import { givingLinkVisible } from '@/lib/commerce'
import { saveAnnouncement, saveGivingUrl, type AdminSettings } from '@/store/churchAdmin'

// The church's notice and its giving link.
//
// ONE live notice at a time (`set_church_announcement` retires the previous
// one), because a church's line on somebody's Play tab is a word from their
// church, not a feed. It shows on the church's public page for anybody, and as
// a dismissible banner for members of a verified church.
//
// The giving link is the verified package's. Whether the app BUILD shows it is
// `givingLinkVisible()` — hidden in the App Store build — and the form says so
// rather than leaving a pastor to wonder why it's missing on their phone.

const MAX = 280

export function NoticesPanel({
  churchId,
  settings,
  onSaved,
  canGenerate = false,
}: {
  churchId: string
  settings: AdminSettings
  onSaved: () => void
  /** The Content Generation add-on — a card for the live notice (0133). */
  canGenerate?: boolean
}) {
  const juice = useJuice()
  const [message, setMessage] = useState(settings.announcement?.message ?? '')
  const [until, setUntil] = useState(settings.announcement?.expiresAt ? todayLocalDate(new Date(settings.announcement.expiresAt)) : '')
  const [giving, setGiving] = useState(settings.givingUrl ?? '')
  const [busy, setBusy] = useState<'notice' | 'giving' | null>(null)
  const [noticeMsg, setNoticeMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [givingMsg, setGivingMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const saveNotice = async (clear = false) => {
    setBusy('notice')
    setNoticeMsg(null)
    const r = await saveAnnouncement(churchId, clear ? '' : message.trim(), clear ? null : until || null)
    setBusy(null)
    if (!r.ok) {
      setNoticeMsg({ ok: false, text: r.reason === 'too_long' ? `Keep it under ${MAX} characters.` : r.reason === 'expires_in_past' ? 'Pick a date from today on.' : 'That didn’t save — try again.' })
      return
    }
    juice.select?.()
    if (clear) {
      setMessage('')
      setUntil('')
    }
    setNoticeMsg({ ok: true, text: clear ? 'Taken down.' : 'Posted. Members will see it on their Play tab.' })
    onSaved()
  }

  const saveGiving = async () => {
    setBusy('giving')
    setGivingMsg(null)
    const r = await saveGivingUrl(churchId, giving.trim())
    setBusy(null)
    if (!r.ok) {
      setGivingMsg({
        ok: false,
        text: r.reason === 'invalid_url' ? 'That link needs to start with https:// — the giving page has to be secure.' : 'That didn’t save — try again.',
      })
      return
    }
    juice.select?.()
    if (r.data.giving_url) setGiving(r.data.giving_url)
    setGivingMsg({ ok: true, text: giving.trim() ? 'Saved.' : 'Giving link removed.' })
    onSaved()
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'grid', gap: 10 }}>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>A notice for your church</b>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          maxLength={MAX}
          placeholder="Potluck after the 10:30 service this Sunday — everyone's welcome."
          aria-label="Notice"
          style={{ resize: 'vertical' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--ink-dim)', minWidth: 0 }}>
            Show until
            <input type="date" value={until} min={todayLocalDate()} onChange={(e) => setUntil(e.target.value)} style={{ minWidth: 0 }} />
          </label>
          <span className="faint" style={{ fontSize: 11.5, flexShrink: 0 }}>{message.length}/{MAX}</span>
        </div>
        <p className="faint" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.45 }}>
          One notice at a time — posting a new one replaces the last. Leave the date empty to keep it up
          until you change it.
        </p>
        {noticeMsg && <p style={{ margin: 0, fontSize: 13, color: noticeMsg.ok ? 'var(--mint)' : 'var(--coral)' }}>{noticeMsg.text}</p>}
        <Button variant="gold" full disabled={!message.trim() || busy !== null} onClick={() => saveNotice(false)}>
          {busy === 'notice' ? 'Posting…' : 'Post notice'}
        </Button>
        {settings.announcement && (
          <button className="faint" onClick={() => saveNotice(true)} disabled={busy !== null} style={{ fontSize: 12.5, textDecoration: 'underline' }}>
            Take the current notice down
          </button>
        )}
      </div>

      {/* A card for the LIVE notice (0133) — verified churches only, since
          members only ever see cards in a verified church. Keyed on the
          notice's id: posting a new notice is a new card, and the old one stops
          showing to members by itself. */}
      {/* Folded since 2026-10-29: open, its thirteen looks pushed the giving
          link, sharing and billing two screens down (MoreTools.tsx). */}
      {settings.verified && settings.announcement && (
        <MoreTools names={['A picture card of this notice']}>
          <AssetStudio
            key={settings.announcement.id}
            churchId={churchId}
            source={{ kind: 'announcement', announcementId: settings.announcement.id }}
            canGenerate={canGenerate}
            preview={{ church_name: settings.name, message: settings.announcement.message }}
          />
        </MoreTools>
      )}

      {settings.verified && (
        <div style={{ display: 'grid', gap: 10 }}>
          <b style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>Giving link</b>
          <p className="dim" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5 }}>
            Your church's own online giving page. Members see a “Give to {settings.name}” link that opens it —
            Verse Arcade takes nothing and never sees the gift.
          </p>
          <input
            value={giving}
            onChange={(e) => setGiving(e.target.value)}
            placeholder="https://yourchurch.org/give"
            aria-label="Giving link"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            maxLength={500}
          />
          {!givingLinkVisible() && (
            <p className="faint" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.45 }}>
              App Store rules keep giving links out of the iPhone app, so members see it on the web at
              versearcade.org.
            </p>
          )}
          {givingMsg && <p style={{ margin: 0, fontSize: 13, color: givingMsg.ok ? 'var(--mint)' : 'var(--coral)' }}>{givingMsg.text}</p>}
          <Button variant="secondary" full disabled={busy !== null || giving.trim() === (settings.givingUrl ?? '')} onClick={saveGiving}>
            {busy === 'giving' ? 'Saving…' : giving.trim() ? 'Save giving link' : 'Remove giving link'}
          </Button>
        </div>
      )}
    </div>
  )
}
