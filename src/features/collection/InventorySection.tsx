import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Button } from '@/components/Button'
import { useInventory, seedGuestInventoryFromCollection } from '@/store/inventory'
import { useChurch } from '@/store/church'
import { useAuth } from '@/store/auth'
import { useSettings } from '@/store/settings'
import { useJuice } from '@/juice/useJuice'
import { collectibleByKey, rarityColor } from '@/data/collectibles'

// What you're holding right now — and what you can do with it.
//
// This is deliberately NOT the collection wall. The wall shows everything that
// exists, locked included, because seeing what you could earn is a pull. The
// Inventory shows only what's actually in your hands, because the question here
// isn't "what's out there" but "what do I do with this".
//
// The answer is: give it to your church. Donating hands over the item and keeps
// the stamp, so the card background it unlocked stays yours and it still counts
// toward its set. What you give up is the object, not the record — which is what
// makes it possible to give a reward away without it feeling like a loss.
export function InventorySection() {
  const navigate = useNavigate()
  const juice = useJuice()
  const items = useInventory((s) => s.items)
  const loaded = useInventory((s) => s.loaded)
  const load = useInventory((s) => s.load)
  const donate = useInventory((s) => s.donate)

  const mode = useAuth((s) => s.mode)
  const church = useChurch((s) => s.church)
  const loadChurch = useChurch((s) => s.load)
  const setSettings = useSettings((s) => s.set)

  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [needChurch, setNeedChurch] = useState(false)

  useEffect(() => {
    load()
    seedGuestInventoryFromCollection()
    loadChurch()
  }, [load, loadChurch])

  // This component only mounts when the section is actually expanded (the
  // Collapsible renders no children while closed), so mounting *is* the moment
  // the player has seen their bag and what it's for. That retires the home-screen
  // nudge — see features/home/InventoryNudge.tsx.
  useEffect(() => {
    setSettings({ inventorySeen: true })
  }, [setSettings])

  // Rarest first, so the thing worth thinking about is at the top.
  const rows = useMemo(() => {
    const order = ['mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common']
    return Object.entries(items)
      .filter(([, qty]) => qty > 0)
      .map(([key, qty]) => ({ key, qty, def: collectibleByKey(key) }))
      .filter((r) => !!r.def)
      .sort(
        (a, b) =>
          order.indexOf(a.def!.rarity) - order.indexOf(b.def!.rarity) ||
          a.def!.name.localeCompare(b.def!.name),
      )
  }, [items])

  const total = rows.reduce((s, r) => s + r.qty, 0)

  const onDonate = async (key: string, name: string) => {
    // The prompt the spec asks for: no church yet, so ask for one rather than
    // failing. A guest has no church to pick at all — they need an account
    // first, and saying so plainly beats a dead button.
    if (!church) {
      setNeedChurch(true)
      setNote(null)
      return
    }
    setBusy(key)
    setNote(null)
    const res = await donate(key)
    setBusy(null)
    if (!res.ok) {
      if (res.reason === 'no_church') {
        setNeedChurch(true)
        return
      }
      setNote(
        res.reason === 'offline'
          ? 'You’re offline — giving needs a connection.'
          : 'That didn’t go through. Try again in a moment.',
      )
      return
    }
    res.leveledUp ? juice.celebrate?.() : juice.coin()
    // Church XP moved, so the tab should agree next time it's opened.
    void loadChurch()
    setNote(
      res.leveledUp
        ? `${name} given — ${church.name} reached level ${res.level}! 🎉`
        : `${name} given to ${church.name} · +${(res.points ?? 0).toLocaleString()}`,
    )
  }

  if (!loaded) {
    return <p className="faint" style={{ fontSize: 13 }}>Opening your bag…</p>
  }

  if (!rows.length) {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 34 }}>🎒</div>
        <b style={{ display: 'block', marginTop: 6, fontFamily: 'var(--font-display)' }}>
          Nothing in hand yet
        </b>
        <p className="dim" style={{ fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>
          Open the Daily Chest, play the daily verse — and keep studying: a study run turns
          something up now and then. Whatever lands here can be given to your church.
        </p>
      </div>
    )
  }

  return (
    <div>
      <p className="faint" style={{ fontSize: 12, marginBottom: 10, lineHeight: 1.5 }}>
        {total} item{total === 1 ? '' : 's'} in hand. Giving one to your church keeps its stamp in
        your Bible — you keep the artwork it unlocked and it still counts toward its set.
      </p>

      <AnimatePresence>
        {needChurch && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="card"
            style={{ overflow: 'hidden', marginBottom: 10, borderColor: 'var(--gold)' }}
          >
            <b style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>
              Which church are you giving to?
            </b>
            <p className="dim" style={{ fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>
              {mode === 'local'
                ? 'Create a free account to join your church — your progress carries over, and then you can give what you’ve collected.'
                : 'Pick the church you actually attend and everything you give goes into its climb.'}
            </p>
            <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
              <Button
                variant="gold"
                full
                onClick={() => navigate(mode === 'local' ? '/auth' : '/church')}
              >
                {mode === 'local' ? '✨ Create a free account' : '⛪ Choose my church'}
              </Button>
              <Button variant="ghost" full onClick={() => setNeedChurch(false)}>
                Not now
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {note && (
        <p className="faint" style={{ fontSize: 12, marginBottom: 10, textAlign: 'center' }}>{note}</p>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {rows.map(({ key, qty, def }) => (
          <motion.div
            key={key}
            layout
            exit={{ opacity: 0, scale: 0.96 }}
            className="card"
            style={{
              padding: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              borderColor: `${rarityColor[def!.rarity]}55`,
            }}
          >
            <div style={{ fontSize: 26, flexShrink: 0 }}>{def!.emoji}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <b style={{ fontSize: 14, fontFamily: 'var(--font-display)' }}>{def!.name}</b>
                {qty > 1 && (
                  <span className="faint" style={{ fontSize: 12 }}>×{qty}</span>
                )}
              </div>
              <div style={{ fontSize: 11, color: rarityColor[def!.rarity], textTransform: 'capitalize' }}>
                {def!.rarity}
              </div>
            </div>
            <button
              onClick={() => onDonate(key, def!.name)}
              disabled={busy === key}
              style={{
                flexShrink: 0,
                padding: '9px 14px',
                borderRadius: 'var(--r-pill)',
                border: '1px solid var(--gold)',
                background: 'rgba(255,210,63,0.12)',
                color: 'var(--gold)',
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                fontSize: 13,
                cursor: busy === key ? 'default' : 'pointer',
                opacity: busy === key ? 0.6 : 1,
              }}
            >
              {busy === key ? 'Giving…' : 'Donate'}
            </button>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
