// "Watch yesterday's verse" — the one player-facing thing the TikTok engine has.
//
// The engine posts three videos a day to six networks (docs/TIKTOK-ENGINE.md);
// until now the app it advertises never mentioned them. This is a row of links
// on the screen a player is already on when they have just finished the drop —
// the day's ritual is over, and the next thing this app has to offer is not
// another run.
//
// Four things about it are load-bearing:
//
// **It's YESTERDAY's, and that is not arbitrary.** The morning cron SCHEDULES
// each of the day's posts at its own hour, and a scheduled post has no URL to
// link to until the network publishes it — the URLs for a day are filled in by
// the next morning's run (`links` in the `tiktok-gen` function). So yesterday's
// verse is the most recent one that reliably exists, and it is also the one
// that can't spoil anything: today's five questions are the same five for
// everybody, and a video of today's verse being read is fine, but a link that
// sometimes worked and sometimes didn't would read as broken.
//
// **It renders NOTHING when there is nothing to watch** — no keys, no post yet,
// a network that isn't linked, a post still pending. That is the ordinary state
// on most days for most platforms, so it has to be the quiet one: no skeleton,
// no "coming soon", no apology. Same rule `FirstLight` follows.
//
// **It carries no number.** Not views, not likes, not "3,000 have watched" —
// the app's own surfaces don't count people at each other and a link out is no
// place to start. What it says is what it is: yesterday's verse, read aloud.
//
// **Every link is a real `<a>`.** A Capacitor WKWebView hands `target="_blank"`
// to the system browser, which is what bounces a tap inside the app out to the
// real TikTok — the same reason `openAppStore()` clicks an anchor instead of
// calling `window.open`. Anything JavaScript-driven here would be the silent
// no-op class of bug that `lib/postcard.ts` documents.

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { getVerseForDate } from '@/data/bible/questions'
import { addDays } from '@/lib/date'
import { postedLinks, type SocialLink } from '@/lib/socialPosts'
import { useJuice } from '@/juice/useJuice'

export function WatchYesterday({ dropDate }: { dropDate: string }) {
  const juice = useJuice()
  const date = addDays(dropDate, -1)
  const [links, setLinks] = useState<SocialLink[]>([])

  useEffect(() => {
    let live = true
    void postedLinks(date, 'verse').then((ls) => {
      if (live) setLinks(ls)
    })
    return () => {
      live = false
    }
  }, [date])

  if (!links.length) return null
  const reference = getVerseForDate(date).reference

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="card"
      style={{ marginTop: 14, textAlign: 'left' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 22, flexShrink: 0 }}>🎬</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <b style={{ display: 'block', fontSize: 14 }}>Watch yesterday’s verse</b>
          <span className="faint" style={{ fontSize: 12 }}>
            {reference}, read aloud in a minute.
          </span>
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        {links.map((l) => (
          <a
            key={l.platform}
            className="pill"
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => juice.tap()}
            // `.pill` says nothing about colour, and an <a> that inherits the
            // browser's blue is the one thing on this screen that looks unstyled.
            style={{ fontSize: 12, fontWeight: 800, textDecoration: 'none', color: 'var(--ink)' }}
          >
            ▶ {l.name}
          </a>
        ))}
      </div>
    </motion.div>
  )
}
