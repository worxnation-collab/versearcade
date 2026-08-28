import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useJuice } from '@/juice/useJuice'
import { useSeason } from '@/store/season'
import { loadVisitedRoom, type VisitedRoom } from '@/store/room'
import { roomTierName } from '@/data/room'
import { RoomScene } from './RoomScene'

// Visiting somebody's room.
//
// Until this existed nobody could stand anywhere another player lives: you
// could LOOK AT a church page, and that was the whole of it. This is the cozy
// half of the multiplayer — you go and see where someone lives, and nothing is
// compared.
//
// What a visitor gets, exactly: the room, its architecture, and the person
// standing in it. What a visitor does NOT get, by construction rather than by
// omission:
//
//   - Any number. room_json (0069) returns no level, no streak, no xp and no
//     count of furnishings. A room you can rank is a scoreboard with a rug on
//     it, and the tier is returned INSTEAD of the level for that reason.
//   - Any way to write. RoomScene takes no `editing` prop here, and there is no
//     RPC that touches another player's placements at all.
//   - Any trace. Nothing records the visit, so no "12 people looked at your
//     room" can be built out of it later — the my_washings rule.
//
// Portalled to document.body and pinned at z-index 112 — ABOVE the player card
// (110) that opened it. The app's tiers encode direction: the keep sheet is at
// 100 because a player card is opened OUT of it, so the card belongs on top.
// This is the other way round, and the first version put it at 100 — which drew
// the card straight over the room you had just asked to see.

export function RoomVisitSheet({ username, onClose }: { username: string; onClose: () => void }) {
  const juice = useJuice()
  const [room, setRoom] = useState<VisitedRoom | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    let alive = true
    void loadVisitedRoom(username).then((r) => {
      if (!alive) return
      if (!r) setMissing(true)
      else {
        setRoom(r)
        // Prepacked verb — a road can score going to see where people live.
        if (!r.isMe) void useSeason.getState().track('room_visited')
      }
    })
    return () => { alive = false }
  }, [username])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (typeof document === 'undefined') return null

  const empty = room && Object.keys(room.placements).length === 0

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="room-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          // 112 — the "opened from the player card" tier. The ladder, so the
          // next session doesn't have to re-derive it from six files:
          //   40  bottom nav
          //   100 sheets (keep, church detail, settings, bundles)
          //   110 the player card, which opens OUT of a 100 sheet
          //   112 sheets the player card itself opens — this one
          //   115 NowPlaying, 120 StudyDropToast / WaystationToast (always on
          //       top: a toast that a sheet can hide is a toast nobody sees)
          //   200 Tutorial, BookOpening (whole-screen takeovers)
          // The tiers encode DIRECTION: a surface sits above the one that
          // opened it. Putting this at 100 drew the card over the room you had
          // just asked to see, and 120 would have buried the toasts.
          zIndex: 112,
          background: 'rgba(8,3,24,0.72)',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
        }}
      >
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: 520,
            maxHeight: '88dvh',
            overflowY: 'auto',
            background: 'var(--bg-1)',
            borderRadius: 'var(--r-lg) var(--r-lg) 0 0',
            border: '1px solid var(--stroke)',
            borderBottom: 'none',
            padding: '14px 14px calc(var(--safe-bottom) + 20px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <b style={{ fontFamily: 'var(--font-display)', fontSize: 18, flex: 1, minWidth: 0 }}>
              @{username}’s Upper Room
            </b>
            <button className="pill" onClick={() => { juice.select(); onClose() }} aria-label="Close">✕</button>
          </div>

          {missing ? (
            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 30 }}>🚪</div>
              <p className="dim" style={{ marginTop: 8, fontSize: 14 }}>
                Couldn’t find that room.
              </p>
            </div>
          ) : !room ? (
            <div className="card" style={{ textAlign: 'center', padding: 40 }}>
              <div className="floaty" style={{ fontSize: 34 }}>🪔</div>
            </div>
          ) : (
            <>
              {/* No `editing` prop: a room you are visiting is inert because the
                  scene was never handed the ability to change, not because a
                  handler decided to say no. */}
              <RoomScene
                tier={room.tier}
                placements={room.placements}
                members={[{
                  username: room.username,
                  avatarEmoji: room.avatarEmoji,
                  avatarCharacter: room.avatarCharacter,
                  isMe: room.isMe,
                }]}
              />
              <p className="faint" style={{ fontSize: 12, margin: '10px 0 0', lineHeight: 1.5 }}>
                <b style={{ color: 'var(--ink-dim)' }}>{roomTierName(room.tier)}</b>
                {empty
                  ? ' · bare, so far. Everyone starts here.'
                  : ' · furnished by the person who lives here.'}
              </p>
              <p className="faint" style={{ fontSize: 11.5, margin: '6px 0 0', lineHeight: 1.5 }}>
                You’re a guest — nothing in here can be moved, and nobody is told you came by.
              </p>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}
