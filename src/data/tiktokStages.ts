// The story's stages: where the evening telling is SET, one backdrop per
// paragraph.
//
// Every story post was one picture — Tabitha's story circle — held for a
// minute while she told what happened somewhere else entirely. This is the
// cheapest thing that makes it read as a story rather than as a recital, and
// it is deliberately the cheapest: a CUT is not motion. The rule this layout
// lives under is that the only thing moving is the caption (see the TikTok
// section of CLAUDE.md), and it exists because drifting motes, a breathing
// halo, page-turn wipes and Veo loops summed to something that read as
// GENERATED rather than painted. A hard cut between two held paintings adds
// none of that: a picture book is entirely still images and reads as story.
//
// Four things are load-bearing:
//
//   - **The stage list is the PREPACK**, exactly as `KNOWN_VERBS` is for a
//     season's quests. The client sends the ids IT has, Gemini picks from
//     that list, and `sanitizeStages` drops anything else — so a story
//     naming a stage this build lacks falls back to the room rather than
//     rendering a backdrop that isn't there. Adding a stage costs a release;
//     CHOOSING one is content and ships without a submission.
//   - **It fails closed at every step.** No `scenes` on a cached story, an
//     unknown id, a painting that 404s, a whole ungenerated batch: every one
//     of those lands on the library, which is a complete post and is exactly
//     what shipped before this existed.
//   - **The LAST paragraph is never staged.** `makeStory` appends the verse
//     and its reference as a final paragraph, and Tabitha reads that from
//     her own book in her own room. Coming back to the library for the verse
//     is what makes the middle feel like somewhere she took you.
//   - **Ten, not fifty.** A stage that is only loosely about the sentence
//     being spoken is worse than one steady picture — the exact reason the
//     per-paragraph picture CARDS were taken out of this layout once
//     already. These are the settings the narrative books actually keep
//     returning to, painted general enough to be true of many stories and
//     specific enough to be somewhere.
//
// The paintings are `kind: 'tiktok-stage'` in `art/tiktok-stages.json` and
// land in `public/tiktok/stages/`, loaded by path like the roads and rooms —
// never wired into `GENERATED_ART`, because no player-facing surface reads
// them.

export interface StageDef {
  id: string
  /** What the operator sees in the hub. */
  name: string
  /** What Gemini is told this stage is for. Kept short: it is a list, not a brief. */
  when: string
}

export const STORY_STAGES: StageDef[] = [
  { id: 'road', name: 'The road', when: 'a journey, travelling, meeting someone on the way, leaving or arriving' },
  { id: 'house', name: 'A house inside', when: 'a household, a meal, a family, a private conversation indoors' },
  { id: 'hills', name: 'Open hills', when: 'shepherds, flocks, a crowd on a hillside, teaching outdoors, open country' },
  { id: 'water', name: 'The shore', when: 'a lake or sea, boats, fishing, a storm, a crossing' },
  { id: 'gate', name: 'The city gate', when: 'a town or city, a market, elders at the gate, a public decision' },
  { id: 'temple', name: 'The temple', when: 'worship, priests, sacrifice, teaching in the courts, prayer at the temple' },
  { id: 'prison', name: 'A cell', when: 'captivity, chains, waiting in the dark, a trial, exile' },
  { id: 'field', name: 'The harvest field', when: 'sowing and reaping, grain, work in the fields, a threshing floor' },
  { id: 'upper', name: 'An upper room', when: 'a small gathering behind a door, a shared table by lamplight, waiting together' },
  { id: 'wilderness', name: 'The wilderness', when: 'desert, wandering, hunger and thirst, being alone with God, testing' },
]

export const STAGE_IDS: ReadonlySet<string> = new Set(STORY_STAGES.map((s) => s.id))

/** Where a stage's painting lives. Loaded by path, like the roads. */
export const stagePath = (id: string) => `/tiktok/stages/${id}.jpg`

/** The dark stage the operator's own half stands on — his, and nobody's story. */
export const OWN_STAGE_PATH = '/tiktok/stages/own.jpg'

/** The list handed to Gemini, so it can only ever name a stage this build has. */
export const stageMenu = () => STORY_STAGES.map((s) => `${s.id} — ${s.when}`).join('\n')

/**
 * The ids a story came back with, one per TOLD paragraph, cleaned. An entry
 * that is not a stage this build carries becomes null and falls back to the
 * library; a story with no `scenes` at all (every one cached before this
 * existed) is all nulls, which is the post exactly as it was.
 */
export function sanitizeStages(v: unknown, count: number): (string | null)[] {
  const raw = Array.isArray(v) ? v : []
  return Array.from({ length: count }, (_, i) => {
    const id = String(raw[i] ?? '').trim().toLowerCase()
    return STAGE_IDS.has(id) ? id : null
  })
}
