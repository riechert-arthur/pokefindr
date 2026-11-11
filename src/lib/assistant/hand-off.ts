/** Where the viewer is, when they've shared it: all the assistant needs. */
export type Viewer = { lng: number; lat: number }

/**
 * A question asked on /home, carried to /chat (#391). It lives in module
 * memory, which survives the app's own (client-side) navigation, so the
 * question never goes into the URL or the browser's storage. A full reload in
 * between drops it, as a reload drops a half-typed question.
 */
let pending: { question: string; viewer: Viewer | null } | null = null

/** Leave a question for /chat to ask. */
export function handOff(question: string, viewer: Viewer | null): void {
  pending = { question, viewer }
}

/** Whether a question is waiting, without taking it (for /chat's first render). */
export function hasHandOff(): boolean {
  return pending !== null
}

/** Take the waiting question, once. */
export function takeHandOff(): { question: string; viewer: Viewer | null } | null {
  const taken = pending
  pending = null
  return taken
}
