import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGame } from '@/store/game'
import { useChurchToday, bannerSeen, markBannerSeen } from '@/store/churchPackage'
import { givingLinkVisible } from '@/lib/commerce'
import { GiveLink } from '@/features/church/ChurchExtras'

// The verified church package, as a member meets it on the Play tab — ONE slim
// card under the two daily boxes, and nothing at all for anybody else.
//
// The Play tab is "daily verse + quiz with streaks" and must still read that
// way (the brief, and the header of HomeScreen): the church is a layer on the
// verse, not a new front page. So this never leads the screen, never takes a
// box of its own, and carries at most three things, each only when it exists:
//
//   1. Whose verse today is, with the pastor's note — when the church's verse
//      IS today's drop. When the church scheduled a verse the arcade can't
//      build a run from (not in the pool), the verse is shown here to READ,
//      since the drop above stayed global.
//   2. The church's newest announcement, the "banner" — dismissible, and a NEW
//      announcement shows again (`bannerSeen` remembers one id per device).
//   3. The giving link, if this build may show one (`givingLinkVisible`).
//
// Renders nothing for: a guest, a keyless build, no church, an unverified
// church, a server without 0116/0117 — every one of which is the Play tab
// exactly as it was.
export function ChurchTodayStrip() {
  const navigate = useNavigate()
  const ct = useChurchToday((s) => s.today)
  const load = useChurchToday((s) => s.load)
  const drop = useGame((s) => s.today)
  const [, bump] = useState(0)

  useEffect(() => {
    void load()
  }, [load])

  if (!ct?.verified || !ct.church_id) return null
  const name = ct.church_name ?? 'Your church'

  const playable = drop?.church?.id === ct.church_id
  const verse = ct.verse
  const news = (ct.announcements ?? [])[0]
  const showNews = !!news && !bannerSeen(news.id)
  const giving = ct.giving_url && givingLinkVisible() ? ct.giving_url : null

  if (!verse && !showNews && !giving) return null

  return (
    <div className="card" style={{ marginTop: 10, padding: '12px 14px', display: 'grid', gap: 10 }}>
      <button
        onClick={() => navigate('/church')}
        className="faint"
        style={{ textAlign: 'left', fontSize: 11, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', padding: 0 }}
      >
        ⛪ {name}
      </button>

      {verse && (
        <div>
          {playable ? (
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.45 }}>
              Today's drop is <b>{verse.reference}</b>, chosen by your church.
            </p>
          ) : (
            <>
              <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.45 }}>
                Your church's verse — <b>{verse.reference}</b>
              </p>
              <p className="dim" style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.5, fontStyle: 'italic', overflowWrap: 'anywhere' }}>
                “{verse.text}”
              </p>
            </>
          )}
          {verse.pastor_note && (
            <p className="dim" style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.5, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
              {verse.pastor_note}
            </p>
          )}
        </div>
      )}

      {showNews && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', borderTop: verse ? '1px solid var(--stroke)' : undefined, paddingTop: verse ? 10 : 0 }}>
          <p style={{ margin: 0, flex: 1, minWidth: 0, fontSize: 13.5, lineHeight: 1.45, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
            📣 {news.message}
          </p>
          <button
            aria-label="Dismiss announcement"
            className="faint"
            onClick={() => { markBannerSeen(news.id); bump((n) => n + 1) }}
            style={{ fontSize: 16, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}
          >
            ×
          </button>
        </div>
      )}

      {giving && (
        <div>
          <GiveLink url={giving} churchName={name} compact />
        </div>
      )}
    </div>
  )
}
