/** Session changes are shared between tabs on this BroadcastChannel. */
const AUTH_CHANNEL = "auth"

export type AuthMessage = "login" | "logout"

const isAuthMessage = (data: unknown): data is AuthMessage => data === "login" || data === "logout"

/** Tells other tabs the session changed, then closes the channel. */
export function broadcastAuth(message: AuthMessage): void {
  if (typeof BroadcastChannel === "undefined") return
  const channel = new BroadcastChannel(AUTH_CHANNEL)
  channel.postMessage(message)
  channel.close()
}

/** Calls `onMessage` when another tab logs in or out. Returns an unsubscribe function. */
export function subscribeAuth(onMessage: (message: AuthMessage) => void): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {}
  const channel = new BroadcastChannel(AUTH_CHANNEL)
  channel.onmessage = (event) => {
    if (isAuthMessage(event.data)) onMessage(event.data)
  }
  return () => channel.close()
}
