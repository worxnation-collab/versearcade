import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Page } from '@/components/Page'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { useBuddies } from '@/store/buddies'
import { useGifts } from '@/store/gifts'
import { useWashing } from '@/store/washing'
import { usePrayerWall } from '@/store/prayerWall'
import { prayerCategoryById } from '@/data/prayerWall'
import { usePlayerCard } from '@/components/PlayerCardModal'
import { useJuice } from '@/juice/useJuice'
import { collectibleByKey } from '@/data/collectibles'
import { activeNews } from '@/data/catalog'

// The mailbox — everything addressed to YOU, in one place.
//
// Two problems this fixes, and the second one is the load-bearing one:
//
//   1. Everything that happened TO a player landed somewhere different. A buddy
//      request was two taps into the You tab, a washing was on the basin, and a
//      gift had nowhere to land at all. A live-service game has a mailbox for
//      the same reason a house has a letterbox.
//
//   2. A SEASON COULD START IN TOTAL SILENCE. The content catalog (0066) can
//      ship a whole road without an App Store submission — and then the only
//      sign of it was that the strip on the season tab quietly became a
//      different strip. `activeNews()` is the announcement channel that was
//      missing, and it costs a release exactly nothing.
//
// WHAT IS NOT IN HERE, and this is the rule the whole screen is built on: every
// item is something that happened to you, and nothing is a comparison. There is
// no "you're 4th", no "3 people visited your room", no digest of what your
// buddies scored. A mailbox in a game with no losers delivers gifts, requests
// and news — never a ranking, and never a nudge that somebody is beating you.
//
// It also never demands to be emptied. Opening the screen marks gifts read; the
// dot goes away because you looked, not because you cleared a queue.

export default function MailScreen() {
  const navigate = useNavigate()
  const juice = useJuice()
  const card = usePlayerCard()

  const gifts = useGifts((s) => s.received)
  const giftsLoaded = useGifts((s) => s.loaded)
  const requests = useBuddies((s) => s.requests)
  const respond = useBuddies((s) => s.respond)
  const washings = useWashing((s) => s.recent)
  // The wall: the note you left (its tally is yours alone — my_prayer_wall
  // returns it to the requester only), and the notes you knelt at that have
  // since been answered. Neither is a comparison: one is a count of a thing
  // done FOR you that nobody else can see, the other is good news.
  const myNote = usePrayerWall((s) => s.mine)
  const answered = usePrayerWall((s) => s.answered)

  // The news is a pure function of the clock against the fetched overlay, so it
  // needs no load of its own — the catalog store already refreshed it at boot.
  const news = useMemo(() => activeNews(), [])

  useEffect(() => {
    void useGifts.getState().load().then(() => useGifts.getState().markSeen())
    void useBuddies.getState().load()
    void useWashing.getState().load()
    void usePrayerWall.getState().load()
  }, [])

  const noteLit = !!myNote && myNote.open && myNote.lit
  const empty =
    giftsLoaded && !gifts.length && !requests.length && !washings.length && !news.length &&
    !answered.length && !noteLit

  return (
    <Page>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <h2 style={{ fontSize: 24, margin: 0 }}>📬 Mail</h2>
        <div style={{ flex: 1 }} />
        <button
          className="pill"
          onClick={() => { juice.select(); navigate(-1) }}
          style={{ fontSize: 13, fontWeight: 800, padding: '7px 14px' }}
        >
          Back
        </button>
      </div>

      {empty && (
        <div className="card" style={{ textAlign: 'center', padding: 30 }}>
          <div style={{ fontSize: 34 }}>📭</div>
          <p className="dim" style={{ marginTop: 10, fontSize: 14, lineHeight: 1.5 }}>
            Nothing today. Gifts, buddy requests, answered prayers and news land here.
          </p>
        </div>
      )}

      {/* News first: it is the only thing here that is about the whole app
          rather than about one person, and it is the reason a season can
          announce itself without a release. */}
      {news.length > 0 && (
        <Section title="News">
          {news.map((n) => (
            <div key={n.id} className="card" style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <span style={{ fontSize: 24, lineHeight: 1.2 }}>{n.emoji}</span>
                <div style={{ minWidth: 0 }}>
                  <b style={{ fontFamily: 'var(--font-display)', fontSize: 15, display: 'block' }}>
                    {n.title}
                  </b>
                  <p className="dim" style={{ fontSize: 13, margin: '4px 0 0', lineHeight: 1.55 }}>
                    {n.body}
                  </p>
                  <span className="faint" style={{ fontSize: 11, display: 'block', marginTop: 6 }}>
                    {new Date(n.at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* Buddy requests: the one thing in this app where another person is
          actually blocked waiting on you, which is what the nav dot marks. */}
      {requests.length > 0 && (
        <Section title="Waiting on you">
          {requests.map((r) => (
            <div key={r.username} className="card" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar emoji={r.avatar_emoji} character={r.avatar_character} username={r.username} size={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontSize: 14, display: 'block' }}>@{r.username}</b>
                <span className="faint" style={{ fontSize: 12 }}>wants to be Bible Buddies</span>
              </div>
              <button
                className="pill"
                onClick={() => { juice.coin(); void respond(r.username, true) }}
                style={{ borderColor: 'var(--good)', color: 'var(--good)', fontWeight: 800 }}
              >
                Accept
              </button>
              <button
                className="pill"
                onClick={() => { juice.select(); void respond(r.username, false) }}
                style={{ fontWeight: 800 }}
              >
                Not now
              </button>
            </div>
          ))}
        </Section>
      )}

      {gifts.length > 0 && (
        <Section title="Given to you">
          {gifts.map((g) => {
            const def = collectibleByKey(g.collectibleKey)
            return (
              <div key={g.id} className="card" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 26, lineHeight: 1 }}>{def?.emoji ?? '🎁'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontSize: 14, display: 'block' }}>{def?.name ?? 'A relic'}</b>
                  <span className="faint" style={{ fontSize: 12 }}>
                    from{' '}
                    <button
                      onClick={() => card.open(g.fromUsername)}
                      style={{ background: 'none', border: 'none', padding: 0, color: 'var(--gold)', fontWeight: 800, cursor: 'pointer', fontSize: 12 }}
                    >
                      @{g.fromUsername}
                    </button>
                    {' · '}
                    {new Date(g.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            )
          })}
          <p className="faint" style={{ fontSize: 11.5, margin: '2px 0 0', lineHeight: 1.5 }}>
            It’s in your bag. Give it to your church on the Church tab, or pass it on.
          </p>
        </Section>
      )}

      {/* Received washings. The count of these is yours alone — my_washings
          returns it to the recipient only, and no board reads the table. */}
      {washings.length > 0 && (
        <Section title="Feet washed">
          {washings.map((w) => (
            <div key={w.username} className="card" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar emoji={w.avatar_emoji} character={w.avatar_character} username={w.username} size={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontSize: 14, display: 'block' }}>@{w.username}</b>
                <span className="faint" style={{ fontSize: 12 }}>knelt and washed your feet 🪣</span>
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* The wall. "Somebody knelt today" is the lantern's shape — today,
          yes, or nothing — and the tally under it is the requester's alone. */}
      {(noteLit || answered.length > 0) && (
        <Section title="The Prayer Wall">
          {noteLit && myNote && (
            <button
              className="card"
              onClick={() => { juice.select(); navigate('/pray') }}
              style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left' }}
            >
              <span style={{ fontSize: 26, lineHeight: 1 }}>🏮</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontSize: 14, display: 'block' }}>Somebody knelt at your note today</b>
                <span className="faint" style={{ fontSize: 12 }}>
                  {prayerCategoryById(myNote.category).emoji} {prayerCategoryById(myNote.category).label}
                  {myNote.prayedTotal > 1 ? ` · ${myNote.prayedTotal} candles so far, a number only you can see` : ''}
                </span>
              </div>
            </button>
          )}
          {answered.map((n) => {
            const cat = prayerCategoryById(n.category)
            return (
              <div key={n.id} className="card" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 26, lineHeight: 1 }}>⭐</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontSize: 14, display: 'block' }}>A prayer you prayed was answered</b>
                  <span className="faint" style={{ fontSize: 12 }}>
                    {cat.emoji} {cat.label}
                    {n.signed && n.username ? ` · @${n.username}` : ''}
                    {n.answeredAt ? ` · ${new Date(n.answeredAt).toLocaleDateString()}` : ''}
                  </span>
                </div>
              </div>
            )
          })}
        </Section>
      )}

      <div style={{ marginTop: 18 }}>
        <Button variant="secondary" full onClick={() => { juice.select(); navigate('/you') }}>
          Back to you
        </Button>
      </div>
    </Page>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div
        className="faint"
        style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, fontWeight: 800 }}
      >
        {title}
      </div>
      {children}
    </div>
  )
}
