import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { ArcadeShell } from './ArcadeShell'
import { ArcadeWelcome } from './ArcadeWelcome'
import { CrossBoard, boardCells } from './CrossArt'
import { VerseCard } from './VerseCard'
import { Button } from '@/components/Button'
import { VerseActions } from './VerseActions'
import { GENERATED_ART } from '@/data/generatedArt'
import { useJuice } from '@/juice/useJuice'
import { useSettings } from '@/store/settings'
import { useCrossword } from '@/store/crossword'
import { useArcadeInvite } from '@/store/arcadeInvite'
import { useArcadeXp, type ArcadePlayResult } from '@/store/arcadeXp'
import { useBible } from '@/store/bible'
import { useDrops } from '@/store/drops'
import { useSeason } from '@/store/season'
import { todayLocalDate } from '@/lib/date'
import {
  CROSS_PUZZLES,
  crossForDate,
  crossSize,
  crossVerse,
  pastCrosses,
  type CrossPuzzle,
} from '@/data/crossword'
import { isGeneratedCross, randomCross } from '@/data/crossGen'

// The Cross Word: two words that share a letter, standing in the shape of a
// cross. Finish it and the squares you filled in turn into two timbers with
// your letters chiselled into them, and the verse both words came out of is
// read underneath. That reveal is the whole reward.
//
// It's a machine in the arcade (`/arcade/cross`) and it still pays exactly what
// a study run pays — a relic roll, a step on the road, and the verse marked
// studied — because what it is hasn't changed with where it stands: nothing
// here is timed, scored, ranked or comparable with anybody else's.
//
// Wrong answers are treated the way they are everywhere else here: a completed
// word that isn't right gets a gentle line and stays editable, nothing is taken
// away, and "Show a letter" costs nothing at all. No timer, no score.
//
// **All of the puzzle's state lives in one reducer, and that is load-bearing.**
// Every edit is derived from the PREVIOUS state rather than from a hook
// snapshot, so two key events inside one tick — a fast typist, a held key, a
// hardware keyboard repeating — compose instead of the second overwriting the
// first. Driving it from a script found exactly that: five letters typed in one
// tick all landed in the same square. Same scar as `KeepSheet`'s double-tap.

const KEY_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM']

/** Room the board leaves below itself: the hint line, the keyboard, the pills. */
const KEYBOARD_SPACE = 220

type Dir = 'down' | 'across'

interface State {
  puzzle: CrossPuzzle
  letters: Record<string, string>
  /** Cells filled by "Show a letter" rather than by the player. */
  given: Record<string, boolean>
  direction: Dir
  cursor: string
  /** A word that's completely filled in and isn't the answer. */
  missed: Dir | null
  done: boolean
}

type Action =
  | { t: 'start'; puzzle: CrossPuzzle }
  | { t: 'reset' }
  | { t: 'type'; ch: string }
  | { t: 'back' }
  | { t: 'tap'; row: number; col: number }
  | { t: 'turn' }
  | { t: 'focus'; direction: Dir }
  | { t: 'hint' }

function keysFor(p: CrossPuzzle, dir: Dir): string[] {
  const { rows, cols } = crossSize(p)
  return dir === 'down'
    ? Array.from({ length: rows }, (_, r) => `${r},${p.acrossIndex}`)
    : Array.from({ length: cols }, (_, c) => `${p.downIndex},${c}`)
}

function answerFor(p: CrossPuzzle, dir: Dir): string {
  return dir === 'down' ? p.down.word : p.across.word
}

function init(puzzle: CrossPuzzle): State {
  return {
    puzzle,
    letters: {},
    given: {},
    direction: 'down',
    cursor: `0,${puzzle.acrossIndex}`,
    missed: null,
    done: false,
  }
}

/** Whether each word is right, and which (if any) is finished but wrong. */
function judge(p: CrossPuzzle, letters: Record<string, string>) {
  const read = (dir: Dir) =>
    keysFor(p, dir)
      .map((k) => letters[k] ?? ' ')
      .join('')
  const down = read('down')
  const across = read('across')
  const downOk = down === p.down.word
  const acrossOk = across === p.across.word
  // Judge a word only once it's completely filled — nagging about one that's
  // half-typed would be scolding somebody mid-thought.
  const missed: Dir | null =
    !downOk && !down.includes(' ') ? 'down' : !acrossOk && !across.includes(' ') ? 'across' : null
  return { downOk, acrossOk, missed, done: downOk && acrossOk }
}

/** Apply an edit and re-judge — every write to `letters` goes through here. */
function settle(s: State, letters: Record<string, string>, given: Record<string, boolean>, cursor: string): State {
  const { missed, done } = judge(s.puzzle, letters)
  return { ...s, letters, given, cursor, missed, done }
}

/**
 * Change which word you're typing.
 *
 * Turning moves the cursor to the start of the work left in the new word rather
 * than leaving it where it was. Two reasons, and the second is the important
 * one: every square but the shared one belongs to a single word, so a cursor
 * left behind would sit outside the word being typed and the keys would do
 * nothing at all — and turning at the shared square means "let me do the other
 * one now", which starts at that word's beginning, not in its middle.
 */
function turn(s: State): State {
  const direction: Dir = s.direction === 'down' ? 'across' : 'down'
  const keys = keysFor(s.puzzle, direction)
  return { ...s, direction, cursor: keys.find((k) => !s.letters[k]) ?? s.cursor }
}

function reducer(s: State, a: Action): State {
  switch (a.t) {
    case 'start':
      return init(a.puzzle)
    case 'reset':
      return init(s.puzzle)

    case 'type': {
      if (s.done) return s
      const keys = keysFor(s.puzzle, s.direction)
      const at = keys.indexOf(s.cursor)
      if (at === -1) return s
      const letters = { ...s.letters, [s.cursor]: a.ch }
      const given = { ...s.given }
      delete given[s.cursor]
      // Advance ONE square, whether or not it already holds a letter.
      //
      // This looks like a place to be clever and skip filled squares, and that
      // is exactly the bug: the shared square is already filled by the first
      // word, so skipping it means the second word's letters land one square
      // early and the whole word is silently off by one. Somebody typing
      // O-P-E-N-E-D is spelling the word, crossing letter included. Found by
      // tapping the real keyboard on the real screen — it types perfectly if
      // you never solve the other word first, which is why it survived.
      const next = keys[at + 1]
      if (next) return settle(s, letters, given, next)
      // End of this word. Carry on into the other one rather than parking on
      // the last letter typed — finishing one word and finding the cursor still
      // sitting on it is the moment people think the puzzle is stuck.
      const other: Dir = s.direction === 'down' ? 'across' : 'down'
      const nextEmpty = keysFor(s.puzzle, other).find((k) => !letters[k])
      if (nextEmpty) return settle({ ...s, direction: other }, letters, given, nextEmpty)
      return settle(s, letters, given, s.cursor)
    }

    case 'back': {
      if (s.done) return s
      const keys = keysFor(s.puzzle, s.direction)
      const at = keys.indexOf(s.cursor)
      if (at === -1) return s
      // Delete under the cursor if there's something there, otherwise step back
      // and delete that — what a text field does.
      const target = s.letters[s.cursor] ? s.cursor : keys[at - 1]
      if (!target) return s
      const letters = { ...s.letters }
      const given = { ...s.given }
      delete letters[target]
      delete given[target]
      return settle(s, letters, given, target)
    }

    case 'tap': {
      if (s.done) return s
      const k = `${a.row},${a.col}`
      const onDown = a.col === s.puzzle.acrossIndex
      const onAcross = a.row === s.puzzle.downIndex
      // The shared square is the only one in both words, so it carries the
      // turn: tapping it when you're already on it is how you change direction.
      if (onDown && onAcross && s.cursor === k) return turn(s)
      return { ...s, cursor: k, direction: onDown ? 'down' : 'across' }
    }

    case 'turn':
      return s.done ? s : turn(s)

    case 'focus': {
      if (s.done) return s
      const keys = keysFor(s.puzzle, a.direction)
      return { ...s, direction: a.direction, cursor: keys.find((k) => !s.letters[k]) ?? keys[0] }
    }

    case 'hint': {
      if (s.done) return s
      // Fill the first square of the word you're on that isn't right yet; if
      // that word is already right, help with the other one instead.
      const order: Dir[] = [s.direction, s.direction === 'down' ? 'across' : 'down']
      for (const dir of order) {
        const keys = keysFor(s.puzzle, dir)
        const answer = answerFor(s.puzzle, dir)
        const i = keys.findIndex((k, n) => s.letters[k] !== answer[n])
        if (i === -1) continue
        const letters = { ...s.letters, [keys[i]]: answer[i] }
        const given = { ...s.given, [keys[i]]: true }
        return settle({ ...s, direction: dir }, letters, given, keys[i])
      }
      return s
    }
  }
}

export default function CrossWordScreen({ demo }: { demo?: boolean }) {
  const today = todayLocalDate()
  const solvedMap = useCrossword((s) => s.solved)
  const loadSolved = useCrossword((s) => s.load)
  const markSolved = useCrossword((s) => s.markSolved)
  const markStudied = useBible((s) => s.markStudied)
  const juice = useJuice()
  // Both switches, because both exist: the OS preference and the app's own
  // "Reduce motion" row in Settings. The wood is this screen's one piece of
  // spectacle, so it's the one that most needs to be skippable.
  const systemStill = useReducedMotion()
  const settingStill = useSettings((s) => s.reduceMotion)
  const reduceMotion = systemStill || settingStill

  // What the screen opens on, decided ONCE at mount.
  //
  // The daily is still the daily: the first time you come here on a given date
  // you get `crossForDate` — one authored puzzle, the same one everybody else
  // is building today. Come back after you've built it and the screen deals a
  // fresh one cut from the pool instead of showing you the cross you just
  // solved, which is what it used to do and what made the machine feel like it
  // only had one puzzle in it.
  //
  // Frozen at mount for the reason `ArcadeInvite`'s have-they-played decision
  // is: re-reading it would swap the board out from under a solve the moment
  // `markSolved` lands.
  const [opening] = useState<CrossPuzzle>(() => {
    const daily = crossForDate(today)
    // Read the set off DISK before deciding. `solved` is empty until load()
    // runs, and a deep link straight to /arcade/cross renders before the effect
    // below fires — so trusting the hook here would make every arrival look
    // like a first visit and re-serve a cross the player had already built.
    if (!useCrossword.getState().loaded) useCrossword.getState().load()
    const solved = useCrossword.getState().solved
    if (!solved[daily.id]) return daily
    return randomCross(Math.random, (p) => !!solved[p.id]) ?? daily
  })

  const [st, dispatch] = useReducer(reducer, opening, init)
  const { puzzle } = st
  const verse = useMemo(() => crossVerse(puzzle), [puzzle])

  useEffect(() => {
    loadSolved()
  }, [loadSolved])

  // Finishing pays out ONCE per puzzle. Everything it pays goes through the
  // stores that already cap it — the drop roll and the road — and the verse is
  // marked studied, which is the half of a solve that belongs to the account
  // rather than to this device (see store/crossword.ts).
  const paid = useRef<string | null>(null)
  const [reward, setReward] = useState<ArcadePlayResult | null>(null)
  useEffect(() => {
    if (!st.done || paid.current === puzzle.id) return
    paid.current = puzzle.id
    juice.celebrate()
    // A free go from a shared link pays nothing and records nothing: whoever is
    // playing has no account to mark a verse on, and a solve written into a
    // stranger's browser is a promise this app can't keep. The wood and the
    // verse — the entire point — happen exactly as they do for anybody else.
    if (!demo) {
      markSolved(puzzle.id, today)
      markStudied(puzzle.reference)
      void useDrops.getState().roll()
      void useSeason.getState().track('study_run')
      // The day's first cross is worth 5 XP, exactly like the day's first run
      // on either tap machine — what is paid for is turning up at a machine,
      // not solving it faster than anybody. Building a second cross pays
      // nothing and says nothing, which is why "Build another" is still an
      // offer rather than a chore.
      void useArcadeXp.getState().record('cross').then(setReward)
    }
    // No-op outside a demo, so this is flat rather than conditional.
    useArcadeInvite.getState().notePlayEnded(today)
  }, [st.done, puzzle.id, puzzle.reference, demo, juice, markSolved, markStudied, today])

  // A word finished and wrong shivers and says so, once, rather than on every
  // keystroke afterwards.
  useEffect(() => {
    if (st.missed) juice.wrong()
  }, [st.missed, juice])

  // A real keyboard works too — this gets played on a desktop as often as not.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (/^[a-zA-Z]$/.test(e.key)) {
        dispatch({ t: 'type', ch: e.key.toUpperCase() })
        e.preventDefault()
      } else if (e.key === 'Backspace') {
        dispatch({ t: 'back' })
        e.preventDefault()
      } else if (e.key === 'Tab' || e.key === ' ') {
        dispatch({ t: 'turn' })
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onLetter = useCallback(
    (ch: string) => {
      juice.tap()
      dispatch({ t: 'type', ch })
    },
    [juice],
  )

  // "Build another" cuts a new cross out of the pool — a random verse, and two
  // words of it that will stand as a cross (`data/crossGen.ts`).
  //
  // It used to walk BACKWARDS through `pastCrosses`, which was the only honest
  // thing to do when the whole machine was fifty-two authored puzzles: drawing
  // from days still to come would have spoiled tomorrow's daily. With 15,000
  // crosses cut on demand from 726 verses there is no tomorrow to spoil, so the
  // courtesy costs nothing and the repetition it caused is gone.
  //
  // The authored past is still the fallback, and deliberately so: it is what
  // answers if a future pool ever stops yielding a legal cross, and it means
  // this button can never do nothing.
  const another = () => {
    const skip = (p: CrossPuzzle) => p.id === puzzle.id || !!solvedMap[p.id]
    const earlier = pastCrosses(today).filter((p) => p.id !== puzzle.id)
    const pick =
      randomCross(Math.random, skip) ??
      earlier.find((p) => !solvedMap[p.id]) ??
      earlier[0] ??
      CROSS_PUZZLES[0]
    juice.whoosh()
    setReward(null)
    dispatch({ t: 'start', puzzle: pick })
  }

  const cells = boardCells(puzzle, st.letters, st.done ? null : st.cursor, st.direction, st.given)
  const built = Object.keys(solvedMap).length
  const isToday = puzzle.id === crossForDate(today).id
  const seenBefore = !!solvedMap[puzzle.id] && !st.done
  // Cut from a verse just now, rather than one of the fifty-two written ones.
  const isFresh = isGeneratedCross(puzzle.id)

  return (
    <ArcadeShell
      title="Cross Word"
      tagline="Two words, one shared letter · finish it and it turns to wood"
      shareId="cross"
    >
      <div className="card" style={{ padding: 14 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 10,
            marginBottom: 10,
            fontSize: 12,
          }}
        >
          <span style={{ color: 'var(--ink-dim)' }}>
            {isToday ? 'Today’s cross' : isFresh ? 'A fresh cross' : 'An earlier cross'}
            {seenBefore && ' · built before'}
          </span>
          {/* Your own tally and NO denominator. It had one — "3 of 52" — back
              when fifty-two authored puzzles were the whole supply. Crosses are
              cut from the pool on demand now, so a denominator would be a bar
              that cannot be filled, which is the one shape this app doesn't put
              in front of anybody. */}
          <span style={{ color: 'var(--ink-faint)' }}>
            {demo ? 'A free go' : built === 1 ? '1 cross built' : `${built} crosses built`}
          </span>
        </div>

        <Clue
          label="Down — the upright"
          clue={puzzle.down.clue}
          length={puzzle.down.word.length}
          active={!st.done && st.direction === 'down'}
          faded={st.done}
          onClick={() => dispatch({ t: 'focus', direction: 'down' })}
        />
        <Clue
          label="Across — the crossbar"
          clue={puzzle.across.clue}
          length={puzzle.across.word.length}
          active={!st.done && st.direction === 'across'}
          faded={st.done}
          onClick={() => dispatch({ t: 'focus', direction: 'across' })}
        />

        <Board
          puzzle={puzzle}
          cells={cells}
          wood={st.done}
          instant={!!reduceMotion}
          shake={st.missed}
          onTapCell={(row, col) => {
            juice.select()
            dispatch({ t: 'tap', row, col })
          }}
        />

        {!st.done && (
          <>
            <div
              aria-live="polite"
              style={{
                minHeight: 18,
                textAlign: 'center',
                fontSize: 12.5,
                lineHeight: 1.35,
                color: st.missed ? 'var(--warn)' : 'var(--ink-faint)',
                margin: '10px 0 8px',
              }}
            >
              {st.missed
                ? 'Not that word yet — the two share the letter where they cross.'
                : 'Tap the middle square to turn the corner.'}
            </div>
            <Keyboard onLetter={onLetter} onBackspace={() => dispatch({ t: 'back' })} />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button
                className="pill"
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => {
                  juice.coin()
                  dispatch({ t: 'hint' })
                }}
              >
                💡 Show a letter
              </button>
              <button
                className="pill"
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => {
                  juice.tap()
                  dispatch({ t: 'reset' })
                }}
              >
                ↺ Start over
              </button>
            </div>
          </>
        )}
      </div>

      <AnimatePresence>
        {st.done && verse && (
          <motion.div
            key={puzzle.id}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              type: 'spring',
              stiffness: 260,
              damping: 26,
              delay: reduceMotion ? 0 : 0.45,
            }}
            // Announced when it arrives: the wood is drawn art and the finished
            // board is aria-hidden, so without this a screen reader gets no
            // signal that the puzzle is done.
            role="status"
            style={{ marginTop: 14 }}
          >
            <VerseCard
              reference={verse.reference}
              text={verse.text}
              note={
                <>
                  {puzzle.down.word} and {puzzle.across.word} both live in this verse
                  {demo ? '.' : ' — it’s marked studied on your Bible now.'}
                </>
              }
            >
              {/* Under the verse rather than over it: the scripture is the
                  payoff of a cross, and a reward line above it would be the
                  screen leading with the smaller thing. */}
              <div style={{ marginTop: 14 }}>
                <ArcadeWelcome reward={reward} />
              </div>
              {/* Both of these belong to somebody with a Bible of their own:
                  keeping a verse writes to a shelf a free go doesn't have, and
                  the chapter reader is behind the account wall, so on a demo
                  they are an offer that goes nowhere and a link that bounces.
                  The verse itself — the whole payoff — stays. */}
              {!demo && (
                <VerseActions reference={verse.reference} book={verse.book} chapter={verse.chapter} />
              )}
              {!demo && (
                <div style={{ marginTop: 14 }}>
                  <Button variant="gold" full onClick={another}>
                    Build another cross
                  </Button>
                </div>
              )}
            </VerseCard>
          </motion.div>
        )}
      </AnimatePresence>
    </ArcadeShell>
  )
}

/** One clue line. Tapping it moves you onto that word. */
function Clue({
  label,
  clue,
  length,
  active,
  faded,
  onClick,
}: {
  label: string
  clue: string
  length: number
  active: boolean
  faded: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '8px 11px',
        marginBottom: 7,
        borderRadius: 'var(--r-sm)',
        background: active ? 'rgba(255,210,63,0.10)' : 'rgba(255,255,255,0.04)',
        border: `1.5px solid ${active ? 'rgba(255,210,63,0.4)' : 'var(--stroke)'}`,
        opacity: faded ? 0.6 : 1,
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          letterSpacing: '0.09em',
          textTransform: 'uppercase',
          color: 'var(--ink-faint)',
          fontFamily: 'var(--font-display)',
        }}
      >
        {label} · {length} letters
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.4, marginTop: 2 }}>{clue}</div>
    </button>
  )
}

/** The board, sized to the column it's actually standing in. */
function Board({
  puzzle,
  cells,
  wood,
  instant,
  shake,
  onTapCell,
}: {
  puzzle: CrossPuzzle
  cells: ReturnType<typeof boardCells>
  wood: boolean
  instant: boolean
  shake: Dir | null
  onTapCell: (row: number, col: number) => void
}) {
  const box = useRef<HTMLDivElement | null>(null)
  const [space, setSpace] = useState({ width: 320, height: 320 })
  const { rows, cols } = crossSize(puzzle)
  const workshop = GENERATED_ART['arcade_workshop']

  // What's left of the screen once the clues above and the keyboard below have
  // had their share. Measured rather than guessed at a fraction of the viewport:
  // a nine-letter upright on a small phone pushed the keyboard off the bottom,
  // and a puzzle you have to scroll to type into is a puzzle you can't play.
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      setSpace({
        width: r.width,
        height: window.innerHeight - (r.top + window.scrollY) - KEYBOARD_SPACE,
      })
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  // The cross is centred on its UPRIGHT, not on its bounding box — a crossbar
  // with a long arm on one side would otherwise sit visibly off to the side of
  // the card. The extra columns that centring needs are budgeted here, so a
  // wide cross still fits instead of overflowing.
  const half = Math.max(puzzle.acrossIndex + 0.5, cols - puzzle.acrossIndex - 0.5)
  const cell = Math.max(
    24,
    Math.min(52, Math.floor(space.width / (half * 2)), Math.floor(space.height / rows)),
  )

  return (
    <div ref={box} style={{ position: 'relative', padding: '8px 0 2px' }}>
      {/* The workshop the cross is cut in: a Nano Banana painting (art/
          arcade.json) behind the board, dim and bare through the middle
          because the cross stands there. It is a BACKDROP and nothing else —
          the timbers themselves are still drawn, for the reason they always
          were: a cross is a different shape for every pair of words and a
          baked image cannot be re-cut per puzzle. Absent, the board sits on
          the card exactly as it did before. */}
      {workshop && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: '4px -6px',
            borderRadius: 'var(--r-md)',
            overflow: 'hidden',
            // Under the cells, and under the wood — both are drawn over it.
            zIndex: 0,
          }}
        >
          <img
            src={workshop}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
          {/* Letters are pale ink on a translucent cell (var(--card) is 6%
              white), so the painting has to stay a long way behind them: a lit
              patch of timber showing through a cell pulls white ink under the
              contrast the rest of the app holds. The scrim keeps the board
              sitting on roughly the page's own --bg-0 whatever the render came
              back like, which is why the workshop was prompted dim and bare
              through the middle as well — belt and braces, because the art is
              the one part of this that cannot be asserted in code. */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(180deg, rgba(11,7,32,0.72) 0%, rgba(11,7,32,0.62) 50%, rgba(11,7,32,0.76) 100%)',
            }}
          />
        </div>
      )}
      <motion.div
        // A wrong word shivers rather than flashing red — nothing here is a
        // failure, it's just not the word yet.
        key={shake ?? 'steady'}
        animate={shake && !instant ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }}
        transition={{ duration: 0.34 }}
        style={{ position: 'relative', zIndex: 1 }}
      >
        <CrossBoard
          puzzle={puzzle}
          cells={cells}
          cell={cell}
          wood={wood}
          instant={instant}
          onTapCell={onTapCell}
        />
      </motion.div>
    </div>
  )
}

/** A compact on-screen keyboard: the OS one covers half a phone. */
function Keyboard({
  onLetter,
  onBackspace,
}: {
  onLetter: (ch: string) => void
  onBackspace: () => void
}) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {KEY_ROWS.map((row, i) => (
        <div key={row} style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>
          {i === 2 && <span style={{ flex: 0.6 }} />}
          {row.split('').map((ch) => (
            <motion.button
              key={ch}
              whileTap={{ scale: 0.9 }}
              onClick={() => onLetter(ch)}
              style={{
                flex: 1,
                minWidth: 0,
                height: 40,
                borderRadius: 8,
                background: 'var(--card-solid)',
                boxShadow: '0 3px 0 rgba(0,0,0,0.4)',
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: 15,
                color: 'var(--ink)',
              }}
            >
              {ch}
            </motion.button>
          ))}
          {i === 2 && (
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={onBackspace}
              aria-label="Delete a letter"
              style={{
                flex: 1.6,
                height: 40,
                borderRadius: 8,
                background: 'var(--card-solid)',
                boxShadow: '0 3px 0 rgba(0,0,0,0.4)',
                fontSize: 15,
              }}
            >
              ⌫
            </motion.button>
          )}
        </div>
      ))}
    </div>
  )
}
