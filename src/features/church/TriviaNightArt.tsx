// The little picture on the "Host a trivia night" inquiry — a screen at the
// front of a hall and people answering on their phones.
//
// It is DRAWN rather than generated, which is a deliberate exception to the
// house rule that art comes through `scripts/gen-art.mjs`. Two reasons, the
// same ones the church kit and the Cross Word's timbers are drawn for:
//
//  • It takes runtime colours — the design tokens — so it stays right if the
//    palette moves, which a baked PNG cannot do.
//  • It is a diagram of a thing that does not exist yet. This whole surface is
//    an inquiry built to find out whether churches want a trivia night before
//    the room is built; commissioning a painting of an unbuilt feature is the
//    wrong order. If the answer comes back yes, this is the natural thing to
//    replace with a real render (`art/church-trivia.json`, `kind: 'scene'`).
//
// Flat fills and no `<defs>`, like the church kit, so it can be dropped into a
// serialised scene or a postcard without dragging references along with it.
export function TriviaNightArt({ height = 132 }: { height?: number }) {
  const wall = 'var(--card-solid)'
  const ink = 'var(--ink-faint)'
  return (
    <svg
      viewBox="0 0 320 132"
      role="img"
      aria-label="A question on a screen at the front of a hall, with people answering on their phones"
      style={{ width: '100%', height, display: 'block' }}
    >
      {/* the screen */}
      <rect x="74" y="6" width="172" height="86" rx="8" fill={wall} stroke="var(--stroke)" strokeWidth="1.5" />
      {/* the question, as two lines of type */}
      <rect x="86" y="18" width="126" height="7" rx="3.5" fill="var(--ink-dim)" opacity="0.85" />
      <rect x="86" y="30" width="84" height="7" rx="3.5" fill="var(--ink-dim)" opacity="0.55" />
      {/* four options, the third one revealed */}
      <rect x="86" y="46" width="148" height="9" rx="4.5" fill="#ffffff" opacity="0.09" />
      <rect x="86" y="58" width="148" height="9" rx="4.5" fill="#ffffff" opacity="0.09" />
      <rect x="86" y="70" width="148" height="9" rx="4.5" fill="var(--good)" opacity="0.9" />
      <rect x="86" y="82" width="148" height="6" rx="3" fill="#ffffff" opacity="0.09" />
      {/* stand */}
      <rect x="158" y="92" width="4" height="10" rx="2" fill={ink} opacity="0.7" />
      <rect x="146" y="101" width="28" height="3" rx="1.5" fill={ink} opacity="0.7" />
      {/* floor */}
      <rect x="10" y="112" width="300" height="1.5" rx="0.75" fill="var(--stroke)" />
      {Figures()}
    </svg>
  )
}

// Three people, front-on, each holding a lit phone. Deliberately faceless and
// featureless: this is a picture of a room, not of anybody in particular, and
// the crowd rule everywhere else in the app is that a figure carries no number
// and no identity.
function Figures() {
  const at = [40, 150, 262]
  const skin = 'var(--grape)'
  return (
    <g>
      {at.map((x, i) => (
        <g key={x} transform={`translate(${x} ${i === 1 ? 4 : 0})`}>
          <circle cx="0" cy="86" r="7.5" fill={skin} opacity={i === 1 ? 0.95 : 0.75} />
          <path
            d="M -9 112 q 0 -17 9 -17 q 9 0 9 17 z"
            fill={skin}
            opacity={i === 1 ? 0.95 : 0.75}
          />
          {/* the phone, lit */}
          <rect x={i === 2 ? -13 : 8} y="98" width="6" height="9" rx="1.5" fill="var(--gold)" />
        </g>
      ))}
    </g>
  )
}
