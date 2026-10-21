import arrangement from '@/assets/icons/arrangement.png'
import buddies from '@/assets/icons/buddies.png'
import customize from '@/assets/icons/customize.png'
import firstlight from '@/assets/icons/firstlight.png'
import freeze from '@/assets/icons/freeze.png'
import invite from '@/assets/icons/invite.png'
import journal from '@/assets/icons/journal.png'
import lock from '@/assets/icons/lock.png'
import mail from '@/assets/icons/mail.png'
import postcard from '@/assets/icons/postcard.png'
import pray from '@/assets/icons/pray.png'
import settings from '@/assets/icons/settings.png'
import streak from '@/assets/icons/streak.png'
import week from '@/assets/icons/week.png'
import stat_streak from '@/assets/icons/stat_streak.png'
import stat_longest from '@/assets/icons/stat_longest.png'
import stat_cards from '@/assets/icons/stat_cards.png'
import stat_xp from '@/assets/icons/stat_xp.png'
import stat_plays from '@/assets/icons/stat_plays.png'
import church_invite from '@/assets/icons/church_invite.png'
import church_landscaping from '@/assets/icons/church_landscaping.png'
import church_giving from '@/assets/icons/church_giving.png'
import church_worldwide from '@/assets/icons/church_worldwide.png'
import church_topgivers from '@/assets/icons/church_topgivers.png'
import church_buildings from '@/assets/icons/church_buildings.png'
import tool_customize from '@/assets/icons/tool_customize.png'
import tool_journal from '@/assets/icons/tool_journal.png'
import tool_mail from '@/assets/icons/tool_mail.png'
import tool_settings from '@/assets/icons/tool_settings.png'
import battle_swords from '@/assets/icons/battle_swords.png'
import battle_live from '@/assets/icons/battle_live.png'
import battle_trophy from '@/assets/icons/battle_trophy.png'
import battle_crown from '@/assets/icons/battle_crown.png'

// The painted stand-ins for the emoji that used to label buttons, headers and
// folds — owner-supplied (2026-10-21), cut out of baked-in checkerboards into
// `src/assets/icons/` as squares balanced for equal visual weight, the same
// treatment as the nav and the "Open right now" rows.
//
// Sized in EM by default, so an icon dropped where an emoji was takes the
// emoji's own box: whatever font-size the label already had, the picture is
// that size and nothing around it moves. Pass a number for a fixed pixel box.
//
// Decorative by default (the words beside it say what it is). Pass `label`
// where the icon stands alone and has to be read out.
const ICONS = {
  arrangement,
  buddies,
  customize,
  firstlight,
  freeze,
  invite,
  journal,
  lock,
  mail,
  postcard,
  pray,
  settings,
  streak,
  week,
  // The player card's five stats (Streak, Longest, Cards, Total XP, Plays).
  stat_streak,
  stat_longest,
  stat_cards,
  stat_xp,
  stat_plays,
  // The church tab's sections and its invite button.
  church_invite,
  church_landscaping,
  church_giving,
  church_worldwide,
  church_topgivers,
  church_buildings,
  // The profile's tool row: Customize, Journal, Mail, Settings.
  tool_customize,
  tool_journal,
  tool_mail,
  tool_settings,
  // The Battle tab: new battle, live battle, the ranks fold and its #1 rows.
  battle_swords,
  battle_live,
  battle_trophy,
  battle_crown,
} as const

export type PaintedIconId = keyof typeof ICONS

export function PaintedIcon({
  id,
  size = '1.2em',
  label,
  style,
}: {
  id: PaintedIconId
  size?: number | string
  label?: string
  style?: React.CSSProperties
}) {
  return (
    <img
      src={ICONS[id]}
      alt={label ?? ''}
      aria-hidden={label ? undefined : true}
      draggable={false}
      style={{
        width: size,
        height: size,
        display: 'inline-block',
        verticalAlign: '-0.22em',
        objectFit: 'contain',
        flexShrink: 0,
        ...style,
      }}
    />
  )
}
