/**
 * Share one in-flight run of a store's `load()` with everybody who asks while
 * it is running. Several screens mount together and each calls the stores it
 * reads — measured on a 400ms round trip, the Play tab sent `my_prayers`,
 * `my_library_card`, `my_arcade_card`, `my_washings` and `my_keep` twice each
 * and `bible_marks` four times, every copy a request a slow phone waits on.
 *
 * Only CONCURRENT calls are merged. A call made after the run settles starts a
 * fresh one, so a store that re-reads after a write still re-reads.
 */
export function shared<T>(fn: () => Promise<T>): () => Promise<T> {
  let running: Promise<T> | null = null
  return () => {
    if (!running) running = fn().finally(() => { running = null })
    return running
  }
}
