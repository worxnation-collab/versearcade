import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { AccountWallCard } from '@/components/AccountWall'
import { ArcadeCabinetBox, type CabinetScreen } from './ArcadeCabinet'
import { arcadeGameById } from './games'
import { GAME_SCREENS } from './gameScreens'
import { useAuth } from '@/store/auth'
import { useArcadeInvite, sanitizeFrom } from '@/store/arcadeInvite'

// A shared link: one free go on one machine, then the invitation.
//
// PUBLIC on purpose — no `RequireProfile`, no wall. Whoever opens this may have
// never seen the app, and the whole point is that the machine is the pitch: you
// play the thing first and are asked afterwards. That's the opposite order from
// the battle invite (`/battle/:id`), which has to ask first because accepting a
// battle writes a score against a real account. Nothing here writes anything —
// see the `demo` prop on the games — so nothing has to be established first.
//
// A player who already has an account is just sent to the machine. The free go
// is for people who don't, and dropping somebody with a full account onto a
// one-play page would be taking something away.

export default function ArcadeInvite() {
  const { game: gameId } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { ready, profile, mode } = useAuth()
  const game = arcadeGameById(gameId)
  const from = sanitizeFrom(params.get('from'))

  // Frozen at mount, and that is load-bearing: finishing the go marks this
  // machine spent, and re-reading it would swap the screen out from under the
  // player at the exact moment their result appears. The go is decided when
  // they arrive, not while they're mid-play.
  const [alreadyPlayed] = useState(() => (gameId ? useArcadeInvite.getState().isSpent(gameId) : false))

  const hasAccount = !!profile && mode !== 'local'

  useEffect(() => {
    if (!game || hasAccount) return
    useArcadeInvite.getState().begin(game.id, from)
    return () => useArcadeInvite.getState().end()
  }, [game, from, hasAccount])

  if (!ready) {
    return (
      <Page noNav>
        <div style={{ display: 'grid', placeItems: 'center', height: '70dvh' }}>
          <div className="floaty" style={{ fontSize: 52 }}>🕹️</div>
        </div>
      </Page>
    )
  }

  if (!game) {
    return (
      <Page noNav>
        <div style={{ textAlign: 'center', paddingTop: 60 }}>
          <div style={{ fontSize: 52 }}>🕳️</div>
          <h1 style={{ fontSize: 24, marginTop: 8 }}>That machine isn’t here</h1>
          <p className="dim" style={{ marginTop: 6 }}>
            The link may be from a newer version of the app.
          </p>
          <div style={{ marginTop: 18 }}>
            <Button variant="gold" full onClick={() => navigate(profile ? '/arcade' : '/')}>
              {profile ? 'See what is here' : 'Open Verse Arcade'}
            </Button>
          </div>
        </div>
      </Page>
    )
  }

  // An account already opens every machine, as often as they like.
  if (hasAccount) return <Navigate to={game.to} replace />

  if (alreadyPlayed) return <Spent title={game.title} screen={game.screen} from={from} />

  const Game = GAME_SCREENS[game.id]
  return <Game demo />
}

/** Come back to the link after the go: the invitation, warmly. */
function Spent({
  title,
  screen,
  from,
}: {
  title: string
  screen: CabinetScreen
  from: string | null
}) {
  const navigate = useNavigate()
  return (
    <Page noNav>
      <div style={{ display: 'grid', placeItems: 'center', paddingTop: 14, marginBottom: 6 }}>
        <ArcadeCabinetBox width={96} screen={screen} />
      </div>
      <AccountWallCard
        icon="🕹️"
        title={`You've had your go on ${title}`}
        line={`${
          from ? `@${from}'s link` : 'That link'
        } was good for one, and the whole arcade is open once you have an account — every machine, as often as you like, plus today's verse and a character of your own.`}
      />
      {/* Never a dead end: there is a whole app behind this one machine, and
          somebody who isn't ready to sign up should be able to go and see it. */}
      <div style={{ marginTop: 12 }}>
        <Button variant="ghost" full onClick={() => navigate('/')}>
          Look around first
        </Button>
      </div>
      <div style={{ height: 40 }} />
    </Page>
  )
}
