import type { QuestVerb } from '@/lib/season'

// Where a quest is DONE.
//
// A quest names a verb and a goal and, until now, nothing else: the three
// dailies on the Play tab's road strip and the list on the Pilgrimage screen
// were text with a bar under it. "Keep a verse" told you what to do and left
// you to work out that the heart lives in the Bible — which is a fair thing to
// ask of somebody who already knows this app, and the exact thing a new player
// cannot do. So every verb this build can score names the door where it is
// scored, and a quest row is a button to it.
//
// Three rules, and they are the whole of it:
//
// - **It is a DOOR, not a shortcut.** The route is where the deed is done, and
//   the deed is still done — nothing here completes a quest, skips a step, or
//   pays anything. Tapping "Read a chapter in your Bible" opens the Bible; it
//   does not mark a chapter read.
// - **It fails closed, per verb.** A verb with no entry (a catalog road may
//   name one this table has not caught up with) simply renders as the text it
//   always was, never as a button that goes nowhere. `questDoor` returns
//   undefined and every caller is written to expect that.
// - **It adds no number.** These rows already carry their own bar, which is the
//   quest's own goal and not a denominator the app invented; tapping one must
//   not start counting anything new. See `features/map/invitations.ts` for the
//   longer version of that argument.
//
// Keep it in sync with `KNOWN_VERBS` in lib/season.ts — `npm run check:quest-doors`
// asserts every verb in that set is either given a door here or listed in
// `DOORLESS` below, so a verb added for a new road cannot quietly ship as a row
// nobody can follow.

/**
 * Verbs that deliberately have nowhere to send anybody. A door is only useful
 * when there is ONE place the deed happens; `unlock_track` is scored by walking
 * into a room you have not been in yet, and there is no single room to open.
 */
export const DOORLESS: ReadonlySet<QuestVerb> = new Set<QuestVerb>(['unlock_track'])

const DOORS: Partial<Record<QuestVerb, string>> = {
  // ── The daily drop ───────────────────────────────────────────────────────
  // Straight into the run, which is what the drop box's own button does. The
  // run's start gate still shows the verse first, so this is the box's button
  // rather than a way past it — and QuizScreen redirects to the recap if the
  // day is already played.
  play_daily: '/play/run',
  play_any: '/play/run',
  answer_correct: '/play/run',
  answers_in_run: '/play/run',
  perfect_run: '/play/run',
  combo: '/play/run',
  // The chest is a sheet on the Play tab rather than a route, so this is the
  // one door that needs a deep link (HomeScreen reads ?chest=1).
  open_chest: '/play?chest=1',
  // Sharing happens on the result screen, which only exists once the day is
  // played — so this points at the tab and lets the day take its course.
  share_daily: '/play',

  // ── The Bible ────────────────────────────────────────────────────────────
  read_chapters: '/bible',
  // The heart is on a verse in a chapter, so the book list is the door. NOT
  // /bible/highlights, which is the shelf of verses already kept.
  save_verses: '/bible',

  // ── Study ────────────────────────────────────────────────────────────────
  study_runs: '/study',
  find_relic: '/study',
  focus_drills: '/study/focus',
  replay_runs: '/study/recent',
  // Tabitha's desk, opened on arrival (StudyScreen reads ?desk=1) — the
  // checkout is a hotspot in the room, not a route of its own.
  borrow_book: '/study?desk=1',

  // ── Battles and the keep ─────────────────────────────────────────────────
  cpu_wins: '/battle/cpu',
  battle_wins: '/battle',
  battles_played: '/battle',
  // The hall is a section on the Battle tab; ?keep=1 opens its sheet, the same
  // deep link the unlock toast uses.
  place_decor: '/battle?keep=1',
  give_offering: '/battle?keep=1',

  // ── The church ───────────────────────────────────────────────────────────
  plant_flora: '/church',
  statue_raised: '/church',

  // ── Your own tab ─────────────────────────────────────────────────────────
  furnish_room: '/you',
  equip_pet: '/you?customize=1',
  pray: '/you?pray=1',
  wash_feet: '/you?people=basin',
  // Relics are given from the bag, both to a church and to a person.
  donate: '/study/bag',
  give_gift: '/study/bag',
  // Somebody else's room is opened from their card, and the shortest list of
  // cards you have is your buddies.
  visit_room: '/buddies',

  // ── Other people ─────────────────────────────────────────────────────────
  pray_for: '/pray',

  // ── The arcade ───────────────────────────────────────────────────────────
  arcade_runs: '/arcade',
  arcade_gathered: '/arcade',
  keep_rest: '/arcade',
}

/** Where this quest is done, or undefined when there is no single place. */
export function questDoor(verb: string): string | undefined {
  return DOORS[verb as QuestVerb]
}
