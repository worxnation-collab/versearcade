// The soundtrack — eight instrumentals, one per place in the app.
//
// Every note here is *generated* at runtime by juice/music.ts, exactly like the
// SFX in juice/sound.ts: there are no audio files to ship, license, download or
// cache. Eight looping tracks as audio would be megabytes in the app binary and
// a licensing question on every one of them; as data they are this file.
//
// The tunes are arcade arrangements of hymn-style themes. Two are the real
// public-domain melodies (Amazing Grace, 1835; Ode to Joy, 1824) — those are the
// ones a player is meant to *recognise* under the chiptune. The rest are
// original themes written in the same modal/pentatonic vocabulary, which is why
// they are named for places rather than for hymns: naming a track after a hymn
// it isn't would be a lie in the music player.
//
// NOTATION
//   melody  "G4:1 B4:0.5 -:2"   note[:beats], '-' is a rest
//   chords  "G3:4 E3m:4 D37:4"  root+octave+quality[:beats]  ('' | m | 7 | m7 | maj7 | sus)
// Melody and chord streams must total the SAME number of beats — that total is
// the loop. checkTrackData() below asserts it, and music.spec runs it in dev.

export type LeadVoice = 'square' | 'pluck' | 'bell'
export type DrumStyle = 'none' | 'soft' | 'drive'

export interface TrackDef {
  id: string
  /** Shown in the "now playing" banner and the music player. */
  name: string
  /** Where you hear it. Reads after "Plays in " and "Found in ", and doubles
   *  as the unlock hint for a track nobody has walked into yet. */
  place: string
  bpm: number
  beatsPerBar: number
  melody: string
  chords: string
  lead: LeadVoice
  drums: DrumStyle
  /** Root-note bass line. Off for the quietest rooms. */
  bass: boolean
  /** Sustained chord pad, 0..1. The "chapel" in the sound. */
  pad: number
  /** Reverb send, 0..1. */
  reverb: number
  /** Eighth-note chord arpeggio under the melody (harp-ish). */
  arp: boolean
}

// ---------------------------------------------------------------------------

export const TRACKS: TrackDef[] = [
  {
    id: 'morning',
    name: 'Morning Light',
    place: 'the Play tab',
    bpm: 96,
    beatsPerBar: 4,
    // Original theme — bright G major, the "you showed up today" tune.
    melody: [
      'D4:1 G4:1 B4:1 A4:1',
      'G4:2 E4:2',
      'E4:1 G4:1 C5:1 B4:1',
      'A4:2 D4:2',
      'E4:1 G4:1 A4:1 B4:1',
      'D5:2 B4:1 G4:1',
      'A4:1 B4:1 A4:1 F#4:1',
      'G4:4',
    ].join(' '),
    chords: 'G3:4 E3m:4 C3:4 D3:4 C3:4 G3:4 D3:4 G3:4',
    lead: 'square',
    drums: 'soft',
    bass: true,
    pad: 0.5,
    reverb: 0.3,
    arp: true,
  },
  {
    id: 'fortress',
    name: 'Mighty Fortress',
    place: 'the Battle tab',
    bpm: 132,
    beatsPerBar: 4,
    // Original theme — D minor, the only track with a real drum kit under it.
    melody: [
      'D4:1 D4:1 F4:1 A4:1',
      'A4:2 G4:1 F4:1',
      'Bb4:1 A4:1 G4:1 F4:1',
      'E4:2 C4:2',
      'D4:1 F4:1 A4:1 D5:1',
      'C5:2 Bb4:2',
      'A4:1 G4:1 F4:1 E4:1',
      'D4:4',
    ].join(' '),
    chords: 'D3m:4 D3m:4 Bb3:4 C3:4 D3m:4 Bb3:4 C3:4 D3m:4',
    lead: 'square',
    drums: 'drive',
    bass: true,
    pad: 0.35,
    reverb: 0.22,
    arp: false,
  },
  {
    id: 'cloister',
    name: 'Cloister',
    place: 'the Study tab',
    bpm: 76,
    beatsPerBar: 4,
    // Original theme — A minor, slow, no drums. Meant to be studied over.
    melody: [
      'A4:2 C5:1 B4:1',
      'A4:2 F4:2',
      'E4:1 G4:1 C5:2',
      'B4:2 G4:2',
      'A4:1 B4:1 C5:1 E5:1',
      'D5:2 C5:2',
      'B4:2 D5:2',
      'A4:4',
    ].join(' '),
    chords: 'A3m:4 F3:4 C3:4 G3:4 A3m:4 F3:4 G3:4 A3m:4',
    lead: 'pluck',
    drums: 'none',
    bass: true,
    pad: 0.6,
    reverb: 0.45,
    arp: true,
  },
  {
    id: 'scriptorium',
    name: 'Scriptorium',
    place: 'your Bible',
    bpm: 64,
    beatsPerBar: 4,
    // Original theme — D dorian, long notes, bells and air. The quietest room in
    // the app: no drums, no arp, and the pad carries it.
    melody: [
      'D4:2 F4:2',
      'G4:4',
      'E4:2 G4:2',
      'A4:4',
      'D5:2 C5:2',
      'A4:2 G4:2',
      'F4:2 E4:2',
      'D4:4',
    ].join(' '),
    chords: 'D3m:4 G3:4 C3:4 A3m:4 D3m:4 G3:4 C3:4 D3m:4',
    lead: 'bell',
    drums: 'none',
    bass: false,
    pad: 0.75,
    reverb: 0.62,
    arp: false,
  },
  {
    id: 'sanctuary',
    name: 'Sanctuary',
    place: 'the Church tab',
    bpm: 72,
    beatsPerBar: 4,
    // Original theme — F major, the big one. Rising fourths and a wide pad.
    melody: [
      'F4:1 F4:1 A4:1 A4:1',
      'C5:1 C5:1 F5:2',
      'E5:1 D5:1 C5:2',
      'A4:2 F4:2',
      'D5:1 D5:1 C5:1 A4:1',
      'Bb4:2 D5:2',
      'C5:1 Bb4:1 A4:1 G4:1',
      'F4:4',
    ].join(' '),
    chords: 'F3:4 Bb3:4 C3:4 F3:4 D3m:4 Bb3:4 C3:4 F3:4',
    lead: 'bell',
    drums: 'none',
    bass: true,
    pad: 0.8,
    reverb: 0.55,
    arp: true,
  },
  {
    id: 'grace',
    name: 'Amazing Grace',
    place: 'the welcome screen',
    bpm: 84,
    beatsPerBar: 3,
    // The real tune (New Britain, 1835 — public domain), 3/4 with the pickup
    // padded out so the bars line up with the chords.
    melody: [
      '-:2 D4:1',
      'G4:1.5 B4:0.5 G4:1',
      'B4:2 A4:1',
      'G4:1.5 E4:0.5 D4:1',
      'D4:3',
      'G4:1.5 B4:0.5 G4:1',
      'B4:2 A4:1',
      'D5:3',
      'D5:2 -:1',
      'D5:1.5 B4:0.5 D5:1',
      'B4:2 A4:1',
      'G4:1.5 E4:0.5 D4:1',
      'D4:3',
      'G4:1.5 B4:0.5 G4:1',
      'B4:2 A4:1',
      'G4:3',
    ].join(' '),
    chords: [
      'G3:3', 'G3:3', 'G3:3', 'C3:3', 'G3:3', 'G3:3', 'G3:3', 'D3:3',
      'D3:3', 'G3:3', 'G3:3', 'C3:3', 'G3:3', 'G3:3', 'D3:3', 'G3:3',
    ].join(' '),
    lead: 'bell',
    drums: 'none',
    bass: true,
    pad: 0.7,
    reverb: 0.5,
    arp: true,
  },
  {
    id: 'heights',
    name: 'The Heights',
    place: 'ranks, buddies and your collection',
    bpm: 108,
    beatsPerBar: 4,
    // Original theme — D major, the victory-lap tune for the rooms where you
    // look at what you've built.
    melody: [
      'D4:1 F#4:1 A4:1 D5:1',
      'C#5:2 A4:2',
      'B4:1 A4:1 F#4:1 A4:1',
      'G4:2 B4:2',
      'A4:1 D5:1 F#5:1 D5:1',
      'B4:2 G4:2',
      'A4:1 B4:1 C#5:1 A4:1',
      'D5:4',
    ].join(' '),
    chords: 'D3:4 A3:4 B3m:4 G3:4 D3:4 G3:4 A3:4 D3:4',
    lead: 'square',
    drums: 'soft',
    bass: true,
    pad: 0.45,
    reverb: 0.3,
    arp: true,
  },
  {
    id: 'joyful',
    name: 'Joyful',
    place: 'a run in progress',
    bpm: 116,
    beatsPerBar: 4,
    // Ode to Joy (Beethoven, 1824 — public domain), up an octave so the lead
    // sits above the bass instead of fighting it.
    melody: [
      'E5:1 E5:1 F5:1 G5:1',
      'G5:1 F5:1 E5:1 D5:1',
      'C5:1 C5:1 D5:1 E5:1',
      'E5:1.5 D5:0.5 D5:2',
      'E5:1 E5:1 F5:1 G5:1',
      'G5:1 F5:1 E5:1 D5:1',
      'C5:1 C5:1 D5:1 E5:1',
      'D5:1.5 C5:0.5 C5:2',
      'D5:1 D5:1 E5:1 C5:1',
      'D5:1 E5:0.5 F5:0.5 E5:1 C5:1',
      'D5:1 E5:0.5 F5:0.5 E5:1 D5:1',
      'C5:1 D5:1 G4:2',
      'E5:1 E5:1 F5:1 G5:1',
      'G5:1 F5:1 E5:1 D5:1',
      'C5:1 C5:1 D5:1 E5:1',
      'D5:1.5 C5:0.5 C5:2',
    ].join(' '),
    chords: [
      'C3:4', 'G3:4', 'C3:4', 'G3:4', 'C3:4', 'G3:4', 'C3:4', 'G3:4',
      'G3:4', 'C3:4', 'G3:4', 'C3:4', 'C3:4', 'G3:4', 'C3:4', 'C3:4',
    ].join(' '),
    lead: 'square',
    drums: 'soft',
    bass: true,
    pad: 0.4,
    reverb: 0.28,
    arp: false,
  },
]

export const TRACK_BY_ID: Record<string, TrackDef> = Object.fromEntries(
  TRACKS.map((t) => [t.id, t]),
) as Record<string, TrackDef>

export function trackById(id: string | null | undefined): TrackDef | null {
  return id ? TRACK_BY_ID[id] ?? null : null
}

/** The track that plays in a given place. One switch, so the whole map is
 *  readable in one screenful and nothing can claim a route twice. */
export function trackForPath(pathname: string): string {
  const p = pathname.toLowerCase()
  // A run is a run wherever it started from — check the deepest routes first.
  if (p.startsWith('/play/run') || p.startsWith('/play/practice')) return 'joyful'
  // The arcade cabinet — a run is a run, so it takes the run's music.
  if (p.startsWith('/arcade')) return 'joyful'
  if (p.startsWith('/battle')) return 'fortress'
  if (p.startsWith('/study') || p.startsWith('/review')) return 'cloister'
  if (p.startsWith('/bible') || p.startsWith('/favorites')) return 'scriptorium'
  if (p.startsWith('/church')) return 'sanctuary' // covers /church and /churches
  if (p.startsWith('/play')) return 'morning'
  if (p.startsWith('/leaderboard') || p.startsWith('/collection') || p.startsWith('/you') || p.startsWith('/buddies')) {
    return 'heights'
  }
  // Landing, onboarding, auth — the front door.
  return 'grace'
}

/** Every track is reachable, or the music player has a permanently locked row.
 *  Called by the data check below rather than at runtime. */
function reachableTracks(): Set<string> {
  const probes = [
    '/', '/welcome', '/auth', '/play', '/play/run', '/play/practice/2026-01-01',
    '/battle', '/battle/cpu', '/study', '/study/focus', '/review', '/bible',
    '/bible/highlights', '/church', '/churches', '/leaderboard', '/collection', '/arcade/manna',
    '/you', '/buddies',
  ]
  return new Set(probes.map(trackForPath))
}

/** Structural check on the track data: the two streams of every track have to
 *  agree on how long the loop is, or the melody drifts against the chords a
 *  little further every time round. Cheap enough to just run at import in dev. */
export function checkTrackData(): string[] {
  const problems: string[] = []
  const beats = (seq: string) =>
    seq.trim().split(/\s+/).reduce((n, tok) => {
      const [, d] = tok.split(':')
      return n + (d === undefined ? 1 : Number(d))
    }, 0)

  for (const t of TRACKS) {
    const m = beats(t.melody)
    const c = beats(t.chords)
    if (Math.abs(m - c) > 1e-6) {
      problems.push(`${t.id}: melody is ${m} beats but chords are ${c}`)
    }
    if (Math.abs(c % t.beatsPerBar) > 1e-6) {
      problems.push(`${t.id}: ${c} beats is not a whole number of ${t.beatsPerBar}-beat bars`)
    }
  }
  const reachable = reachableTracks()
  for (const t of TRACKS) {
    if (!reachable.has(t.id)) problems.push(`${t.id}: no route plays it, so it can never be unlocked`)
  }
  return problems
}

if (import.meta.env?.DEV) {
  const problems = checkTrackData()
  if (problems.length) console.warn('[music] track data:\n  ' + problems.join('\n  '))
}
