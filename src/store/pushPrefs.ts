import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuth } from './auth'

// Which kinds of push a player wants (0163). The SERVER is the authority:
// push-send's deliver() reads `profiles.push_prefs` before every send, so this
// store is only the switchboard Settings draws.
//
// Online-only, and that is inherited rather than chosen: every one of these
// five is a note from another account (a battle played, a buddy's yes, a
// washing, an answered prayer, a church check-in), delivered to a
// push_subscriptions / device_tokens row that only an account has. A guest has
// nothing here to switch off.

export type PushKind = 'battle' | 'buddy' | 'gesture' | 'answered' | 'check_in'

export const PUSH_KINDS: { kind: PushKind; label: string; line: string }[] = [
  { kind: 'battle', label: 'Battles', line: 'When a friend plays the battle you sent.' },
  { kind: 'buddy', label: 'Buddies', line: 'When somebody says yes to your buddy request.' },
  { kind: 'gesture', label: 'Kindnesses', line: 'A washing or a prayer for you — at most once a day.' },
  { kind: 'answered', label: 'Answered prayers', line: 'When a note you knelt at is marked answered.' },
  { kind: 'check_in', label: 'Church check-ins', line: 'A note from your church’s leaders.' },
]

const ALL_ON: Record<PushKind, boolean> = { battle: true, buddy: true, gesture: true, answered: true, check_in: true }

function isOnline() {
  const a = useAuth.getState()
  return !!supabase && a.mode === 'online' && a.isAuthed
}

interface PushPrefsState {
  prefs: Record<PushKind, boolean>
  loaded: boolean
  /** false against a server without 0163 — Settings then draws no rows. */
  available: boolean
  load: () => Promise<void>
  set: (kind: PushKind, on: boolean) => Promise<boolean>
}

export const usePushPrefs = create<PushPrefsState>((setState, get) => ({
  prefs: ALL_ON,
  loaded: false,
  available: false,
  async load() {
    if (!isOnline()) { setState({ loaded: true, available: false }); return }
    const { data, error } = await supabase!.rpc('my_push_prefs')
    if (error || !data) { setState({ loaded: true, available: false }); return }
    setState({ prefs: { ...ALL_ON, ...(data as Partial<Record<PushKind, boolean>>) }, loaded: true, available: true })
  },
  async set(kind, on) {
    if (!isOnline()) return false
    const before = get().prefs
    setState({ prefs: { ...before, [kind]: on } })
    const { data, error } = await supabase!.rpc('set_push_pref', { p_kind: kind, p_on: on })
    if (error || !data?.ok) {
      // Don't leave an optimistic lie on screen: re-read what the server holds.
      setState({ prefs: before })
      void get().load()
      return false
    }
    setState({ prefs: { ...ALL_ON, ...(data.prefs as Partial<Record<PushKind, boolean>>) } })
    return true
  },
}))
