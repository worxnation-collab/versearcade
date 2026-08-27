import { motion } from 'framer-motion'
import { TRACKS } from '@/data/music'
import { useMusic, musicProgress } from '@/store/music'
import { useSettings } from '@/store/settings'
import { useNowPlaying } from '@/juice/MusicDirector'
import { useJuice } from '@/juice/useJuice'

// The music player: the whole soundtrack, what you've walked into so far, and
// the mute. Locked tracks stay visible and name the room that plays them —
// same call as the collection wall, where seeing what you could find pulls
// harder than hiding it, and here the "cost" of finding one is only ever
// visiting a tab you already have.
export function MusicSection() {
  const juice = useJuice()
  const settings = useSettings()
  const unlocked = useMusic((s) => s.unlocked)
  const pin = useMusic((s) => s.pin)
  const playing = useNowPlaying()
  const { have, total } = musicProgress(unlocked)
  const on = settings.musicEnabled

  return (
    <>
      <h3 style={{ fontSize: 14, margin: '0 0 8px' }} className="dim">
        Music <span className="faint" style={{ fontSize: 12 }}>· {have}/{total} found</span>
      </h3>

      <div className="card" style={{ display: 'grid', gap: 4, marginBottom: 10 }}>
        <button
          onClick={() => {
            const next = !on
            settings.set({ musicEnabled: next })
            if (next) juice.select()
          }}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 4px', width: '100%' }}
        >
          <span style={{ fontWeight: 600 }}>🎵 Background music</span>
          <span style={{
            width: 50, height: 30, borderRadius: 999, background: on ? 'var(--good)' : 'rgba(255,255,255,0.15)',
            position: 'relative', transition: 'background 0.2s', flexShrink: 0,
          }}>
            <span style={{
              position: 'absolute', top: 3, left: on ? 23 : 3, width: 24, height: 24, borderRadius: 999,
              background: '#fff', transition: 'left 0.2s', boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
            }} />
          </span>
        </button>

        {on && (
          <>
            <div style={{ height: 1, background: 'var(--stroke)' }} />
            <div style={{ padding: '10px 4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span>🎚️ Music volume</span>
                <span className="faint">{Math.round(settings.musicVolume * 100)}%</span>
              </div>
              {/* Music has its own level: it plays under everything else, and the
                  sound-effects slider is the wrong knob for "quieter score". */}
              <input
                type="range" min={0} max={1} step={0.05} value={settings.musicVolume}
                onChange={(e) => settings.set({ musicVolume: Number(e.target.value) })}
                aria-label="Music volume"
                style={{ width: '100%' }}
              />
            </div>
          </>
        )}
      </div>

      <div className="card" style={{ display: 'grid', gap: 6, marginBottom: 6, opacity: on ? 1 : 0.5 }}>
        {TRACKS.map((t) => {
          const found = unlocked.includes(t.id)
          const isPlaying = on && playing === t.id
          return (
            <button
              key={t.id}
              disabled={!found || !on}
              onClick={() => { juice.select(); pin(t.id) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left',
                padding: '9px 10px', borderRadius: 12,
                background: isPlaying ? 'var(--grape)' : 'var(--card-solid)',
                border: `1px solid ${isPlaying ? 'var(--gold)' : 'var(--stroke)'}`,
                cursor: found && on ? 'pointer' : 'default',
              }}
            >
              <span style={{ fontSize: 17, flexShrink: 0, width: 20, textAlign: 'center' }} aria-hidden>
                {found ? (isPlaying ? <Bars /> : '♪') : '🔒'}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontFamily: 'var(--font-display)', fontSize: 14.5, display: 'block' }}>
                  {found ? t.name : '???'}
                </b>
                <span className="faint" style={{ fontSize: 11.5, lineHeight: 1.35, display: 'block' }}>
                  {found ? `Plays in ${t.place}` : `Found in ${t.place}`}
                </span>
              </span>
              {isPlaying && (
                <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--gold)', flexShrink: 0 }}>NOW</span>
              )}
            </button>
          )
        })}
      </div>

      <p className="faint" style={{ fontSize: 11, lineHeight: 1.4, marginBottom: 18 }}>
        Every room in the app has its own tune, and walking in is all it takes to keep it.
        Pick one here to hear it now — moving to another tab hands the music back to the room.
      </p>
    </>
  )
}

// Three little bars, because a static "playing" label next to a thing that is
// audibly playing reads as broken.
function Bars() {
  return (
    <span aria-hidden style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, height: 14 }}>
      {[0, 0.18, 0.36].map((delay, i) => (
        <motion.span
          key={i}
          animate={{ height: [4, 13, 6, 11, 4] }}
          transition={{ repeat: Infinity, duration: 1.1, delay, ease: 'easeInOut' }}
          style={{ width: 3, borderRadius: 2, background: 'var(--gold)' }}
        />
      ))}
    </span>
  )
}
