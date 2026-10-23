import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/Button'
import { useAuth } from '@/store/auth'
import { useJuice } from '@/juice/useJuice'
import { churchPricesVisible } from '@/lib/commerce'
import { startCustomAvatarCheckout } from '@/lib/checkout'
import {
  fetchAvatarRequest,
  photoToJpegBase64,
  saveLeaderLook,
  submitAvatarRequest,
  type AvatarRequest,
  type Entitlements,
} from '@/store/churchAdmin'
import { LeaderLookFigure, leaderLookName } from '../leaderLooks'
import {
  AVATAR_NOTES_MAX,
  AVATAR_PHOTOS_MAX,
  CHURCH_PRODUCTS,
  DEFAULT_LEADER_LOOK,
  DEFAULT_LEADER_LOOKS,
  formatUsd,
  type LeaderLookId,
} from '../pricing'

// The leader's look (0136), and the Custom Leader Avatar request.
//
// Presentation only: `set_my_leader_look` re-checks the base tier and refuses
// 'custom' until one was delivered to YOU; `submit_church_avatar_request`
// re-checks the add-on. Nothing here ranks anybody or shows a member anything —
// a look is how leadership appears, chosen by the leader.
//
// `setup` is the moment straight after a leader claims the church (the claim
// screen lands here) and nothing is chosen yet: the same picker, worded as a
// first step rather than a setting.
export function LeaderLookPanel({
  churchId,
  ent,
  setup = false,
  onChanged,
}: {
  churchId: string
  ent: Entitlements | null
  setup?: boolean
  onChanged: () => void
}) {
  const juice = useJuice()
  const spec = useAuth((s) => s.profile?.avatarCharacter ?? null)
  const [look, setLook] = useState<LeaderLookId | null>(ent?.leaderLook ?? null)
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => setLook(ent?.leaderLook ?? null), [ent?.leaderLook])

  const shown: LeaderLookId = look ?? DEFAULT_LEADER_LOOK
  const options: LeaderLookId[] = [
    ...DEFAULT_LEADER_LOOKS.map((l) => l.id),
    ...(ent?.customArtUrl ? (['custom'] as const) : []),
  ]

  const pick = async (id: LeaderLookId) => {
    if (id === look) return
    juice.select?.()
    const before = look
    setLook(id)
    setMsg(null)
    const r = await saveLeaderLook(churchId, id)
    if (!r.ok) {
      setLook(before)
      setMsg(r.reason === 'not_verified' ? 'Leader looks come with the Church Leader plan.' : "That didn't save — try again in a moment.")
      return
    }
    onChanged()
  }

  const blurb = shown === 'custom'
    ? 'Made from your photos.'
    : DEFAULT_LEADER_LOOKS.find((l) => l.id === shown)?.blurb

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="card" style={{ display: 'grid', gap: 10 }}>
        <div>
          <b style={{ fontFamily: 'var(--font-display)', fontSize: 17 }}>
            {setup ? 'First, how should you appear?' : 'Your leader look'}
          </b>
          <p className="dim" style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.5 }}>
            How you appear as leadership of this church. Your own character everywhere else in the app stays as it is.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <LeaderLookFigure look={shown} spec={spec} customArtUrl={ent?.customArtUrl} size={86} />
          <div style={{ minWidth: 0 }}>
            <b style={{ fontSize: 15 }}>{leaderLookName(shown)}</b>
            {blurb && <div className="dim" style={{ fontSize: 12.5, lineHeight: 1.45 }}>{blurb}</div>}
            {!look && <div className="faint" style={{ fontSize: 11.5, marginTop: 4 }}>Not chosen yet — tap one below.</div>}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: 8, minWidth: 0 }}>
          {options.map((id) => {
            const on = id === look
            return (
              <button
                key={id}
                onClick={() => void pick(id)}
                aria-pressed={on}
                className="card"
                style={{
                  padding: '8px 4px 6px',
                  display: 'grid',
                  justifyItems: 'center',
                  gap: 4,
                  minWidth: 0,
                  background: on ? 'var(--select)' : 'var(--card-raised)',
                  border: on ? '1.5px solid var(--gold)' : '1px solid var(--edge)',
                  cursor: 'pointer',
                }}
              >
                <LeaderLookFigure look={id} spec={spec} customArtUrl={ent?.customArtUrl} size={48} />
                <span style={{ fontSize: 11.5, fontWeight: 700, lineHeight: 1.2, textAlign: 'center', color: 'var(--ink)' }}>
                  {leaderLookName(id)}
                </span>
              </button>
            )
          })}
        </div>
        {msg && <div style={{ fontSize: 12.5, color: 'var(--coral)' }}>{msg}</div>}
      </div>

      <CustomAvatarCard churchId={churchId} ent={ent} onChanged={onChanged} />
    </div>
  )
}

function CustomAvatarCard({ churchId, ent, onChanged }: { churchId: string; ent: Entitlements | null; onChanged: () => void }) {
  const juice = useJuice()
  const product = CHURCH_PRODUCTS.customLeaderAvatar
  const has = !!ent?.customLeaderAvatar
  const [buying, setBuying] = useState(false)
  const [buyNote, setBuyNote] = useState<string | null>(null)
  const buy = async () => {
    juice.select?.()
    setBuying(true)
    setBuyNote(null)
    const r = await startCustomAvatarCheckout(churchId)
    setBuying(false)
    if (r === 'unavailable') setBuyNote('Online checkout isn’t connected yet — reply to your billing email or tap “Add info” on your church page and we’ll add it.')
  }
  const [req, setReq] = useState<AvatarRequest | null | undefined>(undefined)
  const [editing, setEditing] = useState(false)

  const load = async () => {
    const r = await fetchAvatarRequest(churchId)
    setReq(r.ok ? r.data : null)
  }
  useEffect(() => {
    if (has) void load()
  }, [has, churchId])

  const header = (
    <div>
      <b style={{ fontFamily: 'var(--font-display)', fontSize: 17 }}>{product.name}</b>
      <p className="dim" style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.5 }}>{product.description}</p>
    </div>
  )

  // Not on the plan. The web says what it costs and how to get it; the App
  // Store build never shows a church price (`churchPricesVisible`).
  if (!has) {
    return (
      <div className="card" style={{ display: 'grid', gap: 8 }}>
        {header}
        {churchPricesVisible() ? (
          <div style={{ display: 'grid', gap: 8, fontSize: 13, lineHeight: 1.5 }}>
            <div><b>{formatUsd(product.amount)}</b> <span className="dim">· one time, on top of Church Leader.</span></div>
            {ent?.customLeaderAvatarHeld ? (
              <div className="faint" style={{ fontSize: 12 }}>On your plan, and switches on with Church Leader.</div>
            ) : (
              <>
                <Button full onClick={() => void buy()} disabled={buying}>
                  {buying ? 'Opening…' : `Get a custom avatar — ${formatUsd(product.amount)}`}
                </Button>
                {buyNote && <div className="faint" style={{ fontSize: 12 }}>{buyNote}</div>}
              </>
            )}
          </div>
        ) : (
          <div className="faint" style={{ fontSize: 12 }}>
            {ent?.customLeaderAvatarHeld ? 'On your plan, and switches on with Church Leader.' : 'An add-on to Church Leader. Not on this church’s plan.'}
          </div>
        )}
      </div>
    )
  }

  if (req === undefined) return <div className="skeleton" style={{ height: 140, borderRadius: 18 }} />

  const canSubmit = !req || (req.mine && (req.status === 'declined' || (req.status === 'submitted' && editing)))

  return (
    <div className="card" style={{ display: 'grid', gap: 10 }}>
      {header}
      {req?.mine && (
        <div>
          <span className="pill" style={{ fontSize: 11.5, fontWeight: 800 }}>{STATUS_LABEL[req.status]}</span>
        </div>
      )}
      {req && !req.mine && req.status !== 'declined' && (
        <Line>Another leader of this church has already sent this church’s request.</Line>
      )}
      {req?.mine && req.status === 'submitted' && !editing && (
        <>
          <Line>
            Sent — {req.photoCount ?? 0} photo{req.photoCount === 1 ? '' : 's'}
            {req.notes ? <> and your notes: “{req.notes}”</> : null}. You can replace them until we start.
          </Line>
          <Button variant="secondary" onClick={() => setEditing(true)}>Replace photos</Button>
        </>
      )}
      {req?.mine && req.status === 'in_progress' && <Line>We’re making it now. It becomes your look the moment it’s ready.</Line>}
      {req?.mine && req.status === 'delivered' && <Line>It’s ready, and it’s your look now — you’ll find it in the list above.</Line>}
      {req?.mine && req.status === 'declined' && (
        <Line>
          We couldn’t make one from that request{req.operatorNote ? <>: “{req.operatorNote}”</> : '.'} Send it again below.
        </Line>
      )}
      {req?.mine && req.operatorNote && req.status !== 'declined' && <Line faint>From us: “{req.operatorNote}”</Line>}

      {canSubmit && (
        <RequestForm
          churchId={churchId}
          initialNotes={req?.mine ? req.notes ?? '' : ''}
          onSent={() => {
            setEditing(false)
            void load()
            onChanged()
          }}
          onCancel={req?.status === 'submitted' ? () => setEditing(false) : undefined}
        />
      )}
    </div>
  )
}

// The words a leader reads for each stored status (0136).
const STATUS_LABEL: Record<AvatarRequest['status'], string> = {
  submitted: 'Pending',
  in_progress: 'In progress',
  delivered: 'Complete',
  declined: 'Needs a new request',
}

function Line({ children, faint }: { children: React.ReactNode; faint?: boolean }) {
  return <div className={faint ? 'faint' : 'dim'} style={{ fontSize: 13, lineHeight: 1.5 }}>{children}</div>
}

function RequestForm({
  churchId,
  initialNotes,
  onSent,
  onCancel,
}: {
  churchId: string
  initialNotes: string
  onSent: () => void
  onCancel?: () => void
}) {
  const juice = useJuice()
  const input = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<{ file: File; url: string }[]>([])
  const [notes, setNotes] = useState(initialNotes)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => () => files.forEach((f) => URL.revokeObjectURL(f.url)), [files])

  const add = (list: FileList | null) => {
    if (!list) return
    const room = AVATAR_PHOTOS_MAX - files.length
    const next = Array.from(list).filter((f) => f.type.startsWith('image/')).slice(0, room)
    setFiles((all) => [...all, ...next.map((file) => ({ file, url: URL.createObjectURL(file) }))])
    if (input.current) input.current.value = ''
  }

  const send = async () => {
    if (!files.length) return setErr('Add at least one photo.')
    setBusy(true)
    setErr(null)
    let photos: string[]
    try {
      photos = await Promise.all(files.map((f) => photoToJpegBase64(f.file)))
    } catch {
      setBusy(false)
      return setErr('One of those photos couldn’t be read. Try a JPEG or PNG.')
    }
    const r = await submitAvatarRequest(churchId, photos, notes)
    setBusy(false)
    if (!r.ok) {
      setErr(
        r.reason === 'no_addon' ? 'The Custom Leader Avatar isn’t on this church’s plan.'
          : r.reason === 'used' ? 'Another leader of this church has already sent the request.'
          : r.reason === 'locked' ? 'We’ve already started on it, so the photos can’t change now.'
          : r.reason === 'bad_photo' ? 'One of those photos couldn’t be used. Try another.'
          : 'That didn’t go through — check your connection and try again.',
      )
      return
    }
    juice.select?.()
    onSent()
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div className="faint" style={{ fontSize: 12, lineHeight: 1.45 }}>
        Up to {AVATAR_PHOTOS_MAX} clear photos of you — face in good light, and one full-length if you have it. They’re seen only by the people making your avatar.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {files.map((f, i) => (
          <div key={f.url} style={{ position: 'relative' }}>
            <img src={f.url} alt={`Reference photo ${i + 1}`} style={{ width: 76, height: 76, objectFit: 'cover', borderRadius: 12, display: 'block' }} />
            <button
              className="pill"
              aria-label={`Remove photo ${i + 1}`}
              onClick={() => setFiles((all) => all.filter((x) => x !== f))}
              style={{ position: 'absolute', top: -6, right: -6, padding: '2px 7px', fontSize: 11 }}
            >
              ✕
            </button>
          </div>
        ))}
        {files.length < AVATAR_PHOTOS_MAX && (
          <button
            className="card"
            onClick={() => input.current?.click()}
            style={{ width: 76, height: 76, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, color: 'var(--ink-dim)', cursor: 'pointer', padding: 0 }}
          >
            + Photo
          </button>
        )}
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => add(e.target.files)} />
      </div>
      <label style={{ display: 'grid', gap: 4 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700 }}>What should you be wearing?</span>
        <textarea
          value={notes}
          maxLength={AVATAR_NOTES_MAX}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="e.g. Grey suit, black clergy shirt, my reading glasses."
          style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontSize: 14, padding: 10, borderRadius: 12, border: '1px solid var(--edge)', background: 'var(--card-raised)', color: 'var(--ink)' }}
        />
        <span className="faint" style={{ fontSize: 11, textAlign: 'right' }}>{notes.length}/{AVATAR_NOTES_MAX}</span>
      </label>
      {err && <div style={{ fontSize: 12.5, color: 'var(--coral)' }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <Button full onClick={() => void send()} disabled={busy || !files.length}>{busy ? 'Sending…' : 'Send my request'}</Button>
        {onCancel && <Button variant="secondary" onClick={onCancel}>Cancel</Button>}
      </div>
    </div>
  )
}
