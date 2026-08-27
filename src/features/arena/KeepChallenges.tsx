import { useEffect } from 'react'
import { Collapsible } from '@/components/Collapsible'
import { useKeep } from '@/store/keep'
import { CHALLENGES, decorById } from '@/data/keep'

// The keep's ladder, on the Battle tab. Every challenge is a battle verb —
// nothing here ever asks you to leave the tab — and each one names the
// furnishing it unlocks, because "what's this FOR" is the whole pull.
//
// No timers, nothing expires, progress only ever goes up. A finished row stays
// visible with its ✓: the ladder is a record, not a to-do list.
export function KeepChallenges() {
  const load = useKeep((s) => s.load)
  const counters = useKeep((s) => s.counters)

  useEffect(() => {
    void load()
  }, [load])

  const done = CHALLENGES.filter((c) => (counters[c.counter] ?? 0) >= c.goal).length

  return (
    <Collapsible icon="🏰" title="Keep challenges" meta={`${done}/${CHALLENGES.length}`}>
      <p className="faint" style={{ fontSize: 11.5, margin: '0 0 8px', lineHeight: 1.5 }}>
        Battles won here furnish your faction's keep — tap a team on the ranks to walk inside.
      </p>
      {CHALLENGES.map((c) => {
        const have = Math.min(counters[c.counter] ?? 0, c.goal)
        const finished = have >= c.goal
        const decor = decorById(c.decor)
        return (
          <div key={c.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--stroke)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 13.5, flex: 1, color: finished ? 'var(--ink-faint)' : 'var(--ink)' }}>
                {finished ? '✓ ' : ''}{c.text}
              </span>
              <span style={{ fontSize: 12, color: finished ? 'var(--good)' : 'var(--gold)', whiteSpace: 'nowrap' }}>
                🛋️ {decor?.name ?? c.decor}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
              <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'rgba(0,0,0,0.35)', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${(have / c.goal) * 100}%`,
                    height: '100%',
                    background: finished ? 'var(--good)' : 'linear-gradient(90deg, var(--grape), var(--gold))',
                  }}
                />
              </div>
              <span className="faint" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                {have}/{c.goal}
              </span>
            </div>
          </div>
        )
      })}
    </Collapsible>
  )
}
