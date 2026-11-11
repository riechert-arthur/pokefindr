/** Where the viewer is, when they've shared it: all the assistant needs. */
export type Viewer = { lng: number; lat: number }

/**
 * What /home passes to /chat (#391), in module memory: it survives the app's
 * own (client-side) navigation, so neither goes into the URL or the browser's
 * storage. A full reload drops both, as it drops a half-typed question.
 */
let pending: { question: string; at: number } | null = null
let shared: Viewer | null = null

/**
 * A question is for the /chat that opens right after it's asked. One left
 * behind (the session had expired and /login came up, or another link won)
 * must not be asked later, unasked, maybe in someone else's chat.
 */
const HAND_OFF_MS = 30_000

/** Leave a question for /chat to ask. */
export function handOff(question: string): void {
  pending = { question, at: Date.now() }
}

/** Take the waiting question, once, if it was asked just now. */
export function takeHandOff(): string | null {
  const taken = pending
  pending = null
  return taken && Date.now() - taken.at < HAND_OFF_MS ? taken.question : null
}

/** Whether a question is waiting, without taking it. */
export function hasHandOff(): boolean {
  return pending !== null
}

/** The location the viewer shared on /home, for /chat's questions this visit ("closest to me"). */
export function shareViewer(viewer: Viewer): void {
  shared = viewer
}

export function sharedViewer(): Viewer | null {
  return shared
}
