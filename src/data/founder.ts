// The one account that built this.
//
// The founder's player card wears a "Founder" tag, and under it — for anyone
// looking who could become a founding patron — the same offer /you's support
// card makes. That is the whole feature: a tag on ONE card, and the app's one
// product offered from the one place its maker is on screen.
//
// Keyed on the USERNAME rather than an id, because `get_player_card` (the RPC
// every pop-up draws from) returns public fields only and no id, and the tag
// has to render for strangers. The owner controls their own handle, so a rename
// moves the tag with them by editing this one line. It is deliberately not a
// server flag: `is_admin` is not in that payload and must never be, since a
// card that announced who the operators are is a different (and worse) feature
// than a card that says who built the thing.
//
// It is a LOOK, not a number: no rank, no board, nothing anybody else is behind
// on — the same line the patron skin holds.

export const FOUNDER_USERNAME = 'sharkbait'

export const isFounder = (username: string | null | undefined): boolean =>
  !!username && username.toLowerCase() === FOUNDER_USERNAME
