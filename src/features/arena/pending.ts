// A battle invite opened by someone not signed in is stashed here so it survives
// the account-creation flow (including an OAuth page reload / redirect), then the
// user is dropped straight back into the invitation once they have a profile.

const KEY = 'va.pendingBattle'

export function setPendingBattle(id: string): void {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    /* storage unavailable — resume just won't happen */
  }
}

export function getPendingBattle(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function clearPendingBattle(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
