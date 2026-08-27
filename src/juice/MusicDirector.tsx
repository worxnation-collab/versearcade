import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Music } from './music'
import { trackForPath } from '@/data/music'
import { useMusic } from '@/store/music'
import { useSettings } from '@/store/settings'

// Mounted once, app-wide. Watches which room the player is in and tells the
// engine what should be sounding — nothing else in the app has to think about
// music at all, which is the same choke-point idea as QuizRunner and useJuice.
/** The track sounding right now, for anything that wants to point at it.
 *  Reads from the engine rather than the store because a pinned track and a
 *  room's track both end up here, and only the engine knows which won. */
export function useNowPlaying(): string | null {
  const [id, setId] = useState<string | null>(() => Music.current())
  useEffect(() => Music.onTrack(setId), [])
  return id
}

export function MusicDirector() {
  const musicEnabled = useSettings((s) => s.musicEnabled)
  const musicVolume = useSettings((s) => s.musicVolume)
  const pinned = useMusic((s) => s.pinned)
  const { pathname } = useLocation()
  const lastPath = useRef(pathname)

  // Declared first so the bus is configured before anything asks to play.
  useEffect(() => {
    Music.configure({ enabled: musicEnabled, volume: musicVolume })
  }, [musicEnabled, musicVolume])

  // Record what actually started, which is what unlocks it.
  useEffect(() => Music.onTrack((id) => { if (id) useMusic.getState().heard(id) }), [])

  // Browsers refuse to start audio before a real gesture, and iOS suspends the
  // context again after an interruption (a call, a hardware mute). So this
  // stays attached rather than firing once — every tap is another chance to
  // come back, and it's a no-op when the context is already running.
  useEffect(() => {
    const wake = () => Music.unlock()
    const opts: AddEventListenerOptions = { passive: true }
    window.addEventListener('pointerdown', wake, opts)
    window.addEventListener('touchend', wake, opts)
    window.addEventListener('keydown', wake)
    return () => {
      window.removeEventListener('pointerdown', wake, opts)
      window.removeEventListener('touchend', wake, opts)
      window.removeEventListener('keydown', wake)
    }
  }, [])

  // Backgrounding freezes the audio clock, so the loop picks up where it left
  // off instead of lurching forward through everything it missed.
  useEffect(() => {
    const onVis = () => (document.hidden ? Music.pause() : Music.resume())
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  useEffect(() => {
    if (!musicEnabled) return
    const movedRooms = lastPath.current !== pathname
    lastPath.current = pathname
    const state = useMusic.getState()
    // Leaving the room ends whatever they picked in the music player. Bail
    // rather than play: clearing the pin re-runs this effect a tick later with
    // the room's own track, so the player hears one crossfade instead of two.
    if (movedRooms && state.pinned) {
      state.pin(null)
      return
    }
    Music.play(state.pinned ?? trackForPath(pathname))
  }, [pathname, pinned, musicEnabled])

  return null
}
