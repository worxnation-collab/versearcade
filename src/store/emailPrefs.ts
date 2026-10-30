import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuth } from './auth'

// Which kinds of email a player wants (0169). The SERVER is the authority:
// comeback_email_claim reads `profiles.email_prefs` before anybody is emailed,
// and every email carries an unsubscribe link that turns the same key off with
// no session. This store is only the switch Settings draws.
//
// Online-only, inherited: the email goes to the address on the ACCOUNT, and a
// guest has no address here to write to.

export type EmailKind = 'comeback'

interface EmailPrefsState {
  comeback: boolean
  /** false with no account email, or against a server without 0169. */
  available: boolean
  load: () => Promise<void>
  set: (kind: EmailKind, on: boolean) => Promise<boolean>
}

function isOnline() {
  const a = useAuth.getState()
  return !!supabase && a.mode === 'online' && a.isAuthed
}

export const useEmailPrefs = create<EmailPrefsState>((setState, get) => ({
  comeback: true,
  available: false,
  async load() {
    if (!isOnline()) { setState({ available: false }); return }
    const { data, error } = await supabase!.rpc('my_email_prefs')
    if (error || !data) { setState({ available: false }); return }
    const d = data as { comeback?: boolean; has_email?: boolean }
    setState({ available: d.has_email === true, comeback: d.comeback !== false })
  },
  async set(kind, on) {
    if (!isOnline()) return false
    const before = get()[kind]
    setState({ [kind]: on } as Partial<EmailPrefsState>)
    const { data, error } = await supabase!.rpc('set_email_pref', { p_kind: kind, p_on: on })
    if (error || !(data as { ok?: boolean } | null)?.ok) {
      setState({ [kind]: before } as Partial<EmailPrefsState>)
      return false
    }
    return true
  },
}))
