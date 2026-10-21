import { useState } from 'react'
import { Icon, type IconId } from '@/data/icons'

// The painted icons on the "Open right now" rows — owner-supplied (2026-10-21),
// cut out of baked-in checkerboards into public/invite/. Like the nav's, every
// file is a 132px square with its painting scaled for equal visual weight and
// set at its optical centre, so one box size fits all of them. Keyed on the
// invitation's id rather than its icon id, because the drawn ids are shared
// (`battle`, `study`) with places that keep their drawn icon.
//
// An invitation with no painting — and any painting that fails to load — draws
// the old gold path, so a new invitation never renders as a hole.
const INVITE_ART: Record<string, string> = {
  verse: '/invite/verse.png',
  chest: '/invite/chest.png',
  wash: '/invite/wash.png',
  wall: '/invite/wall.png',
  mail: '/invite/mail.png',
  pray: '/invite/pray.png',
  arcade: '/invite/arcade.png',
  review: '/invite/review.png',
}

const SIZE = 32

export function InviteIcon({ id, icon }: { id: string; icon: IconId }) {
  const [broken, setBroken] = useState(false)
  const art = INVITE_ART[id]
  return (
    <span
      aria-hidden
      style={{ flexShrink: 0, width: SIZE, height: SIZE, display: 'grid', placeItems: 'center', lineHeight: 0, color: 'var(--gold)' }}
    >
      {art && !broken ? (
        <img
          src={art}
          alt=""
          width={SIZE}
          height={SIZE}
          draggable={false}
          onError={() => setBroken(true)}
          style={{ width: SIZE, height: SIZE, objectFit: 'contain', display: 'block', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))' }}
        />
      ) : (
        <Icon id={icon} size={20} />
      )}
    </span>
  )
}
