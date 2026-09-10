// When each post goes out, per kind and per platform — the ONE copy.
//
// The morning runner schedules a whole day and the voice CLI schedules one
// post at a time, and both have to agree: a reading rendered by hand and a
// reading rendered by the cron are the same post on the same feeds, and two
// tables of hours would drift the moment either was tuned. `kind@platform`
// overrides `kind`; anything unset falls back to the kind's own time, so a
// new kind needs no rows here.
//
// The stagger is deliberate rather than decorative. Eight networks receiving
// the identical video in the same minute is the shape a scheduler has, not
// the shape a person has, and the feeds that judge a CHANNEL are the ones
// that notice. So each gets its own hour, ordered by when its audience is
// actually there.
export const DEFAULT_TIMES = [
  // The morning verse: the ritual, moved off 4am Pacific.
  'verse=08:00', 'verse@youtube=08:00', 'verse@facebook=08:15', 'verse@instagram=08:30',
  'verse@tiktok=09:00', 'verse@snapchat=09:15', 'verse@threads=12:00', 'verse@x=12:15',
  // Pinterest is a SEARCH engine — a pin is found for years and its posting
  // hour barely matters, so it sits off the cluster entirely.
  'verse@pinterest=14:00',
  // The day's second post, in the evening.
  'second=19:30', 'second@facebook=19:00', 'second@instagram=19:15', 'second@youtube=19:30',
  'second@tiktok=20:00', 'second@snapchat=20:15', 'second@threads=20:30', 'second@x=21:00',
  'second@pinterest=15:00',
  // Monday's note, and the parked formats if they are ever switched back on.
  'note=12:00', 'challenge=10:00', 'quiz=12:30', 'challenge2=16:00',
].join(',')

/** Every weekday reading and the story share the evening slot under the alias `second`. */
export const slotOf = (kind) => (kind === 'verse' || kind === 'note' || kind === 'challenge' || kind === 'quiz' || kind === 'challenge2' ? kind : 'second')

/** `POST_TIMES` in the environment replaces the table wholesale, as it always did. */
export const timesFrom = (env = {}) => Object.fromEntries((env.POST_TIMES || DEFAULT_TIMES).split(',').map((kv) => kv.split('=').map((s) => s.trim())))

export const timeFor = (times, kind, platform) => times[`${slotOf(kind)}@${platform}`] || times[slotOf(kind)] || times[kind] || '12:00'
