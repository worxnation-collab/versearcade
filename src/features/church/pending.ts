// A church page opened by someone not signed in is stashed here so it survives
// the account-creation flow (including an OAuth page reload / redirect), then
// the visitor is dropped straight back onto the church they came for.
//
// Copied deliberately from features/arena/pending.ts rather than generalised:
// two keys with two lifetimes is simpler than one module that has to explain
// which pending thing wins when someone has both.

const KEY = 'va.pendingChurch'

export function setPendingChurch(id: string): void {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    /* storage unavailable — resume just won't happen */
  }
}

export function getPendingChurch(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function clearPendingChurch(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

// The leadership dashboard opened signed out — from "Plan on a bigger screen"
// on a phone, landing in a desktop browser with no session. Same shape, its
// own key: `ChurchResume` sends a real account straight back to
// /church/:id/admin, where the server re-checks leadership as always.
const ADMIN_KEY = 'va.pendingChurchAdmin'

export function setPendingChurchAdmin(id: string): void {
  try { localStorage.setItem(ADMIN_KEY, id) } catch { /* resume just won't happen */ }
}
export function takePendingChurchAdmin(): string | null {
  try {
    const id = localStorage.getItem(ADMIN_KEY)
    if (id) localStorage.removeItem(ADMIN_KEY)
    return id
  } catch {
    return null
  }
}
