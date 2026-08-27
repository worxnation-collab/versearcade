// Battle "factions" — an optional, friendly-rivalry layer for the Battle tab.
// Choosing one is opt-in (default: none), and it only ever appears on the
// Battle ranks, never the encouragement-first main leaderboard. Your battle
// wins auto-pool into your faction's total — nobody pushes points.
//
// Keys are stored on the profile (`profiles.denomination`, free text — no CHECK
// constraint, so this list can grow without a migration); names + colors are
// display-only and live here.
//
// The list is not Christians-only on purpose. `agnostic` and `atheist` are
// ordinary teams with ordinary colors, because the app's whole bet is that
// reading the verse is the win: someone who joins to out-quiz the churchgoers
// still spends the week in scripture. So they're grouped, never marked — no
// separate styling, no asterisk, no "guest" tier. Same board, same rules.
//
// Colors were measured, not eyeballed (same rule as the Study chart): every
// entry clears ΔE 9+ from every other under normal, deutan and protan vision,
// since a faction is a 10px dot next to an avatar and that dot is the only
// thing telling two rows apart.

export type DenominationGroup = 'christian' | 'open'

export interface Denomination {
  key: string
  name: string
  color: string
  /** Which optgroup the selector files it under. Undefined = ungrouped, listed
   *  last (that's `other`, which belongs to neither heading). */
  group?: DenominationGroup
}

export const DENOMINATION_GROUPS: { key: DenominationGroup; label: string }[] = [
  { key: 'christian', label: 'Christian traditions' },
  { key: 'open', label: 'Not religious' },
]

export const DENOMINATIONS: Denomination[] = [
  { key: 'non_denominational', name: 'Non-denominational', color: '#5EC8C2', group: 'christian' },
  { key: 'baptist', name: 'Baptist', color: '#C0492E', group: 'christian' },
  { key: 'catholic', name: 'Catholic', color: '#8C2434', group: 'christian' },
  { key: 'methodist', name: 'Methodist', color: '#E07A3C', group: 'christian' },
  { key: 'lutheran', name: 'Lutheran', color: '#4B7BE5', group: 'christian' },
  { key: 'presbyterian', name: 'Presbyterian', color: '#7A5AF0', group: 'christian' },
  { key: 'pentecostal', name: 'Pentecostal / Charismatic', color: '#E0518B', group: 'christian' },
  { key: 'anglican', name: 'Anglican / Episcopal', color: '#3E9B6C', group: 'christian' },
  { key: 'orthodox', name: 'Orthodox', color: '#B8863A', group: 'christian' },
  { key: 'reformed', name: 'Reformed', color: '#5A6BB0', group: 'christian' },
  { key: 'adventist', name: 'Adventist', color: '#7FB03C', group: 'christian' },
  { key: 'evangelical', name: 'Evangelical', color: '#E0B048', group: 'christian' },
  { key: 'agnostic', name: 'Agnostic', color: '#C7B8FF', group: 'open' },
  { key: 'atheist', name: 'Atheist', color: '#7EE0B0', group: 'open' },
  { key: 'other', name: 'Other', color: '#9AA0AC' },
]

export const denominationByKey = (key?: string | null): Denomination | undefined =>
  key ? DENOMINATIONS.find((d) => d.key === key) : undefined

export const denominationName = (key?: string | null): string => denominationByKey(key)?.name ?? ''
export const denominationColor = (key?: string | null): string => denominationByKey(key)?.color ?? '#9AA0AC'

/** True for the teams that aren't a church tradition. Used only to say
 *  "you're welcome here" once, never to gate or decorate anything. */
export const isOpenFaction = (key?: string | null): boolean =>
  denominationByKey(key)?.group === 'open'
