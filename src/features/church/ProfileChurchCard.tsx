import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/store/auth'
import { useChurch } from '@/store/church'
import { useJuice } from '@/juice/useJuice'
import { ChurchArt } from './ChurchArt'

// Your church, as one thin row on your own profile: the building, the name,
// and an arrow to the Church tab.
//
// `ChurchNudge` is the no-church half of this slot and removes itself the
// moment there is a church; this is the other half, so `/you` still says which
// congregation somebody plays for.
//
// It is a DOOR, not a summary, and that is deliberate (2026-10-26). It used to
// carry the level bar, the head count, the live notice and a Leadership pill,
// which made it the tallest thing in "Your people" — the church surface
// dominating the one tab that is about the individual player. Every one of
// those lives on `/church` already (the yard, the week, the notice, the
// leadership tools), and a second copy here is two surfaces to keep in step
// (the "one component per world" rule). So: no number, no notice, nothing
// editable, one tap to /church. Online-only, inherited from `store/church.ts`.
export function ProfileChurchCard() {
  const navigate = useNavigate()
  const juice = useJuice()
  const mode = useAuth((s) => s.mode)
  const church = useChurch((s) => s.church)
  const loaded = useChurch((s) => s.loaded)
  const load = useChurch((s) => s.load)

  const online = mode === 'online' && !!supabase

  useEffect(() => {
    if (online && !loaded) void load()
  }, [online, loaded, load])

  // Nothing until the store has answered — and nothing at all without a church,
  // where `ChurchNudge` already has the slot.
  if (!online || !loaded || !church) return null

  const place = [church.city, church.region].filter(Boolean).join(', ')

  return (
    <motion.button
      className="card"
      onClick={() => { juice.select?.(); navigate('/church') }}
      whileTap={{ scale: 0.985 }}
      aria-label={`Open ${church.name}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
        padding: '8px 12px 8px 10px', marginBottom: 10, color: 'inherit', font: 'inherit', cursor: 'pointer',
      }}
    >
      <div aria-hidden style={{ width: 36, height: 36, flexShrink: 0, display: 'grid', placeItems: 'end center' }}>
        <ChurchArt level={church.level} skin={church.skin} size={36} />
      </div>
      {/* minWidth 0: a flex item's min-width is `auto`, so a long church name
          would otherwise push the row off a 320px phone. */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {church.name}
        </div>
        {place && (
          <div className="faint" style={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {place}
          </div>
        )}
      </div>
      <span aria-hidden className="faint" style={{ fontSize: 18, flexShrink: 0 }}>›</span>
    </motion.button>
  )
}
