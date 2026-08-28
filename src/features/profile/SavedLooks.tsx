import { useEffect, useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { useAuth } from '@/store/auth'
import { useLooks, MAX_LOOKS } from '@/store/looks'
import { useJuice } from '@/juice/useJuice'
import { petById } from '@/data/pets'
import { cardBgStyle } from '@/data/playerCards'

// Saved looks — the whole outfit under one name.
//
// Six shelves deep, putting a look back together after trying something on
// meant remembering six separate choices and finding six separate tiles. This
// saves the combination.
//
// Device-local in both modes on purpose (see store/looks.ts): a look is a
// shortcut for your fingers, not a possession. It grants nothing and unlocks
// nothing — every piece it names is something the account already owns, and the
// equip paths re-check that, so a look naming a skin you no longer have simply
// doesn't apply that part rather than failing.

export function SavedLooks() {
  const juice = useJuice()
  const profile = useAuth((s) => s.profile)
  const looks = useLooks((s) => s.looks)
  const [naming, setNaming] = useState(false)
  const [draft, setDraft] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    useLooks.getState().load()
  }, [])

  if (!profile) return null
  const full = looks.length >= MAX_LOOKS

  const save = () => {
    const ok = useLooks.getState().save(draft)
    setNaming(false)
    setDraft('')
    if (ok) juice.coin()
    setMsg(ok ? 'Saved.' : `That's ${MAX_LOOKS} looks — remove one first.`)
  }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <p className="faint" style={{ fontSize: 11.5, margin: '0 0 12px', lineHeight: 1.5 }}>
        Save what you&rsquo;re wearing — character, skin, pet, card background, border and badge —
        and put the whole thing back on in one tap. Kept on this device.
      </p>

      {looks.length === 0 ? (
        <p className="dim" style={{ fontSize: 13, margin: '0 0 12px', lineHeight: 1.5 }}>
          No looks saved yet.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))' }}>
          {looks.map((l) => (
            <div
              key={l.id}
              style={{
                position: 'relative',
                borderRadius: 14,
                border: '1px solid var(--stroke)',
                overflow: 'hidden',
                ...cardBgStyle(l.cardBackground),
              }}
            >
              <button
                onClick={() => { juice.select(); void useLooks.getState().apply(l.id); setMsg(`Wearing “${l.name}”.`) }}
                aria-label={`Wear ${l.name}`}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '12px 6px 10px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                <span style={{ display: 'grid', placeItems: 'center' }}>
                  <Avatar
                    emoji={profile.avatarEmoji}
                    character={l.spec}
                    border={l.border ?? 'default'}
                    badge={l.badge}
                    size={52}
                    ring={false}
                  />
                </span>
                <span style={{ display: 'block', fontSize: 11, fontWeight: 800, marginTop: 6, lineHeight: 1.25 }}>
                  {l.name}
                </span>
                <span className="faint" style={{ display: 'block', fontSize: 10, marginTop: 2 }}>
                  {l.pet ? (petById(l.pet)?.name ?? 'with a pet') : 'no pet'}
                </span>
              </button>
              <button
                onClick={() => { juice.select(); useLooks.getState().remove(l.id); setMsg(null) }}
                aria-label={`Delete ${l.name}`}
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  border: '1px solid var(--stroke)',
                  background: 'rgba(10,5,26,0.8)',
                  color: 'var(--ink-dim)',
                  fontSize: 12,
                  lineHeight: 1,
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {naming ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save() }}
            placeholder="Name this look"
            maxLength={24}
            style={{
              flex: 1,
              minWidth: 0,
              padding: '9px 12px',
              borderRadius: 999,
              border: '1px solid var(--stroke)',
              background: 'rgba(255,255,255,0.05)',
              color: 'var(--ink)',
              fontSize: 14,
            }}
          />
          <Button variant="gold" onClick={save}>Save</Button>
        </div>
      ) : (
        <button
          className="pill"
          disabled={full}
          onClick={() => { juice.select(); setNaming(true); setMsg(null) }}
          style={{ marginTop: 12, fontWeight: 800, fontSize: 12.5, opacity: full ? 0.5 : 1 }}
        >
          {full ? `${MAX_LOOKS} saved — remove one first` : '＋ Save what I’m wearing'}
        </button>
      )}

      {msg && (
        <p className="center" style={{ margin: '10px 0 0', fontSize: 12.5, fontWeight: 800, color: 'var(--gold)' }}>
          {msg}
        </p>
      )}
    </div>
  )
}
