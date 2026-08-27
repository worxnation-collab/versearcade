// Study drops — what the Study tab quietly hands you for showing up.
//
// Finishing any study run (CPU race, focus drill, replay, "keep it" review)
// rolls once for a relic. It pays no points, no XP and no standing: the Study
// tab stays rank-free, and the only thing a found relic is good for is giving
// it to your church (donate_collectible, migration 0049). So the incentive to
// study is an offering, not a score — which is the one shape this app allows.
//
// The odds and the cap exist twice, as reward math always does here: once in
// TypeScript for guests (store/drops.ts) and once in SQL for online accounts
// (roll_study_drop, migration 0055). KEEP THEM IN SYNC — change one, change the
// other, or guests and accounts quietly play different games.
export const STUDY_DROP = {
  /** Chance that one finished study run turns something up. */
  chance: 0.22,
  /**
   * Finds per local day. Only actual finds count against it — a dry run costs
   * nothing — so the cap bounds farming without punishing someone who studies
   * a lot and gets unlucky.
   */
  dailyCap: 3,
} as const
