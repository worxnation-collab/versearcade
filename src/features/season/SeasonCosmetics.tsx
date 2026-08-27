import { Collapsible } from '@/components/Collapsible'
import { useSeason } from '@/store/season'
import { useJuice } from '@/juice/useJuice'
import { Burst } from '@/juice/confetti'
import {
  CHEST_SKINS,
  CONFETTI_THEMES,
  COSMETIC_DEFAULTS,
  FLAMES,
  TITLES,
  confettiById,
  type CosmeticKind,
} from '@/data/season'

// What you wear from the road. Four kinds so far — a title under your name, the
// confetti that fires on a correct answer, the streak flame on the home screen,
// and the Daily Chest's skin.
//
// These are the cheap reward types and that's the point: none of them is art,
// all of them are seen constantly, and each new one is a catalog entry rather
// than a migration (they share profiles.equipped_cosmetics).
//
// A locked tile is shown, not hidden — it says where it comes from, because
// "there's another one further down the road" is the whole reason to walk it.
// Nothing here is for sale, so a locked tile can never be a storefront.

interface Row {
  kind: CosmeticKind
  label: string
  options: { id: string; name: string; glyph: string }[]
  /** Whether this kind can be cleared back to nothing (only titles). */
  clearable?: boolean
}

const ROWS: Row[] = [
  {
    kind: 'title',
    label: 'Title',
    options: TITLES.map((t) => ({ id: t.id, name: t.text, glyph: '🏷️' })),
    clearable: true,
  },
  {
    kind: 'confetti',
    label: 'Confetti',
    options: CONFETTI_THEMES.map((c) => ({ id: c.id, name: c.name, glyph: '🎊' })),
  },
  {
    kind: 'flame',
    label: 'Streak flame',
    options: FLAMES.map((f) => ({ id: f.id, name: f.name, glyph: f.glyph })),
  },
  {
    kind: 'chest',
    label: 'Daily Chest',
    options: CHEST_SKINS.map((c) => ({ id: c.id, name: c.name, glyph: c.glyph })),
  },
]

export function SeasonCosmetics() {
  const equipped = useSeason((s) => s.equipped)
  const unlocks = useSeason((s) => s.unlocks)
  const owns = useSeason((s) => s.owns)
  const equip = useSeason((s) => s.equip)
  const juice = useJuice()

  const total = ROWS.reduce((n, r) => n + r.options.filter((o) => owns(o.id)).length, 0)
  const all = ROWS.reduce((n, r) => n + r.options.length, 0)

  return (
    <Collapsible icon="✨" title="What you're wearing" meta={`${total}/${all}`}>
      {ROWS.map((row) => {
        const current = equipped[row.kind] ?? COSMETIC_DEFAULTS[row.kind]
        return (
          <div key={row.kind} style={{ marginBottom: 14 }}>
            <div
              className="faint"
              style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}
            >
              {row.label}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {row.clearable && (
                <Tile
                  glyph="—"
                  name="None"
                  active={!current}
                  owned
                  onClick={() => {
                    juice.select()
                    void equip(row.kind, null)
                  }}
                />
              )}
              {row.options.map((o) => {
                const owned = owns(o.id)
                return (
                  <Tile
                    key={o.id}
                    glyph={o.glyph}
                    name={o.name}
                    active={current === o.id}
                    owned={owned}
                    onClick={
                      owned
                        ? () => {
                            juice.select()
                            void equip(row.kind, o.id)
                            // Confetti is the one cosmetic you can't see from a
                            // tile, so picking one fires it.
                            if (row.kind === 'confetti') Burst.preview(confettiById(o.id))
                          }
                        : undefined
                    }
                  />
                )
              })}
            </div>
          </div>
        )
      })}
      {unlocks.length === 0 && (
        <p className="faint" style={{ fontSize: 12, margin: 0, lineHeight: 1.5 }}>
          Walk the road and these fill in. Everything on it is free.
        </p>
      )}
    </Collapsible>
  )
}

function Tile({
  glyph,
  name,
  active,
  owned,
  onClick,
}: {
  glyph: string
  name: string
  active: boolean
  owned: boolean
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={!owned}
      title={owned ? name : `${name} — further down the road`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 10px',
        borderRadius: 10,
        fontSize: 12.5,
        cursor: owned ? 'pointer' : 'default',
        border: `1px solid ${active ? 'var(--gold)' : 'var(--stroke)'}`,
        background: active ? 'rgba(255,210,63,0.14)' : 'rgba(255,255,255,0.04)',
        color: active ? 'var(--gold)' : owned ? 'var(--ink-dim)' : 'var(--ink-faint)',
        opacity: owned ? 1 : 0.5,
      }}
    >
      <span aria-hidden>{owned ? glyph : '·'}</span>
      {name}
    </button>
  )
}
