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
