import { supabase } from '@/lib/supabase'

// The gestures that give something reach the person they're for (0161): a
// friend's washing, or a kneeling at their Prayer Wall note. Sent blind after
// the gesture itself succeeded — `gesture_push_claim` decides whether there
// is anybody to tell and keeps it to one push a day per recipient, so this
// ignores the answer. `.invoke` sends on call; nothing waits on it.
export function pushGesture(kind: 'wash' | 'kneel', target: string) {
  supabase?.functions
    .invoke('push-send', { body: { action: 'gesture', kind, target } })
    .catch(() => { /* a push is a nudge on top of the gesture, never the gesture */ })
}

// A note marked answered tells everybody who knelt at it, once (0162) —
// unnamed and uncounted. Same blind send; the server's claim decides.
export function pushAnswered(requestId: string) {
  supabase?.functions
    .invoke('push-send', { body: { action: 'answered', request_id: requestId } })
    .catch(() => { /* the answer is saved either way */ })
}
