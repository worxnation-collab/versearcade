// Denomination "factions" — an optional, friendly-rivalry layer for the Battle
// tab. Choosing one is opt-in (default: none), and it only ever appears on the
// Battle ranks, never the encouragement-first main leaderboard. Your battle
// wins auto-pool into your denomination's total — nobody pushes points.
//
// Keys are stored on the profile; names + colors are display-only and live here,
// so the list can grow (or a denomination skin pack can hang off a key) later.

export interface Denomination {
  key: string
  name: string
  color: string
}

export const DENOMINATIONS: Denomination[] = [
  { key: 'non_denominational', name: 'Non-denominational', color: '#5EC8C2' },
  { key: 'baptist', name: 'Baptist', color: '#C0492E' },
  { key: 'catholic', name: 'Catholic', color: '#8C2434' },
  { key: 'methodist', name: 'Methodist', color: '#E07A3C' },
  { key: 'lutheran', name: 'Lutheran', color: '#4B7BE5' },
  { key: 'presbyterian', name: 'Presbyterian', color: '#7A5AF0' },
  { key: 'pentecostal', name: 'Pentecostal / Charismatic', color: '#E0518B' },
  { key: 'anglican', name: 'Anglican / Episcopal', color: '#3E9B6C' },
  { key: 'orthodox', name: 'Orthodox', color: '#B8863A' },
  { key: 'reformed', name: 'Reformed', color: '#5A6BB0' },
  { key: 'adventist', name: 'Adventist', color: '#7FB03C' },
  { key: 'evangelical', name: 'Evangelical', color: '#E0B048' },
  { key: 'other', name: 'Other', color: '#9AA0AC' },
]

export const denominationByKey = (key?: string | null): Denomination | undefined =>
  key ? DENOMINATIONS.find((d) => d.key === key) : undefined

export const denominationName = (key?: string | null): string => denominationByKey(key)?.name ?? ''
export const denominationColor = (key?: string | null): string => denominationByKey(key)?.color ?? '#9AA0AC'
