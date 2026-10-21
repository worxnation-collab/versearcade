import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChurchArt } from '@/features/church/ChurchArt'
import { tierForLevel } from '@/features/church/levels'
import { PaintedIcon, type PaintedIconId } from '@/components/PaintedIcon'
import { gatheringLabel, gatheringOpen, gatheringWindow } from '@/data/gathering'
import { useChurch } from '@/store/church'
import { useJuice } from '@/juice/useJuice'

// The church window on the Play tab, where the Harvest Road strip used to sit.
//
// The road did not go anywhere: it keeps its own screen (/pilgrimage), its row
// on the map, and its quests still score from every surface. It just stopped
// being the third thing on the tab everybody lands on, because a congregation
// is the reason most people stay and the road is the reason some people grind.
//
// Two states, and neither draws anything about a PERSON:
//
//   * You have a church — its own building at its real tier and skin (the
//     same painted render the board draws), its name, and at most two short
//     signals that are true right now: how many play there (a church total,
//     already public on its page) and the gathering hour, which is either
//     open or tonight. No giver, no rank, no "who played today" — the church
//     rules in CLAUDE.md, applied to a card.
//   * You don't — what a church adds, in four short lines, and ONE button into
//     the existing picker at /church. A guest meets the account wall there,
//     which is the pitch; a keyless build meets the Church tab's own card.
//
// Renders nothing until the church store has answered, so a member never sees
// "Add your church" flash before their own name arrives.
export function ChurchWindow() {
  const navigate = useNavigate()
  const juice = useJuice()
  const church = useChurch((s) => s.church)
  const loaded = useChurch((s) => s.loaded)
  const loading = useChurch((s) => s.loading)
  const load = useChurch((s) => s.load)
  // The gathering line is a clock; re-read it once a minute so "open now"
  // turns on and off without a reload.
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    if (!loaded && !loading) void load()
  }, [loaded, loading, load])

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(t)
  }, [])

  if (!loaded) return null

  const go = () => {
    juice.select?.()
    navigate('/church')
  }

  if (church) {
    const open = gatheringOpen(now)
    return (
      <Shell onClick={go} label={`Open ${church.name}`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div aria-hidden style={{ width: 72, height: 72, flexShrink: 0, display: 'grid', placeItems: 'end center' }}>
            <ChurchArt level={church.level} skin={church.skin} size={72} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="faint" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Your church
            </div>
            <div
              style={{
                fontSize: 17,
                fontWeight: 800,
                lineHeight: 1.2,
                marginTop: 2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {church.name}
            </div>
            <div className="faint" style={{ fontSize: 12, marginTop: 1 }}>
              {tierForLevel(church.level).name}
              {church.city ? ` · ${church.city}` : ''}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
          <Signal icon="buddies">
            {church.members === 1 ? 'You play here — invite your congregation' : `${church.members.toLocaleString()} play here`}
          </Signal>
          <Signal icon="week" lit={open}>
            {open ? 'The gathering hour is open now' : `Gathering hour ${gatheringWhen(now)}`}
          </Signal>
        </div>

        <div style={{ marginTop: 12 }}>
          <CardButton>Open church</CardButton>
        </div>
      </Shell>
    )
  }

  return (
    <Shell onClick={go} label="Add your church">
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div aria-hidden style={{ width: 64, height: 64, flexShrink: 0, display: 'grid', placeItems: 'end center', opacity: 0.9 }}>
          <ChurchArt level={1} size={64} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.2 }}>Add your church</div>
          <div className="faint" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.4 }}>
            Play for your own congregation.
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
        <Signal icon="buddies">See who plays from your church</Signal>
        <Signal icon="week">This week’s news from your church</Signal>
        <Signal icon="pray">Pray for each other at the wall</Signal>
        <Signal icon="journal">Study the verse your church picks</Signal>
      </div>

      <div style={{ marginTop: 12 }}>
        <CardButton>Add church</CardButton>
      </div>
    </Shell>
  )
}

function Shell({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <motion.button
      className="card"
      onClick={onClick}
      aria-label={label}
      whileTap={{ scale: 0.985 }}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '14px 14px 14px',
        cursor: 'pointer',
        color: 'inherit',
        font: 'inherit',
      }}
    >
      {children}
    </motion.button>
  )
}

function Signal({ icon, lit = false, children }: { icon: PaintedIconId; lit?: boolean; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 13,
        lineHeight: 1.35,
        color: lit ? 'var(--gold)' : 'var(--ink-dim)',
        fontWeight: lit ? 700 : 500,
      }}
    >
      <PaintedIcon id={icon} size={18} style={{ verticalAlign: 'middle' }} />
      <span style={{ minWidth: 0 }}>{children}</span>
    </div>
  )
}

// Drawn as a button inside the card's own button, so the whole card is the tap
// target and this is only what it looks like — no nested <button>. Outlined in
// bronze, not filled gold: the gold is rationed to the thing to do NEXT, and on
// this tab that is today's verse in the box above.
function CardButton({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: 42,
        borderRadius: 14,
        border: '1.5px solid var(--edge)',
        color: 'var(--gold)',
        fontWeight: 800,
        fontSize: 15,
      }}
    >
      {children}
    </span>
  )
}

// "in 40 min" / "tonight at 8:00 pm" / "tomorrow at 1:00 am" — the same
// words `gatheringLine` picks, because the hour is ONE instant worldwide and
// for some players it lands after their midnight.
function gatheringWhen(now: Date): string {
  const { start } = gatheringWindow(now)
  const mins = Math.round((start.getTime() - now.getTime()) / 60_000)
  if (mins < 60) return `in ${Math.max(1, mins)} min`
  return start.getDate() === now.getDate() ? `tonight at ${gatheringLabel(now)}` : `tomorrow at ${gatheringLabel(now)}`
}
