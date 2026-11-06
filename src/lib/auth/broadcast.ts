/** Messages other tabs listen for on the "auth" channel (see SessionProvider). */
export type AuthMessage = "login" | "logout"

/** Tells other tabs the session changed, then closes the channel. */
export function broadcastAuth(message: AuthMessage): void {
  if (typeof BroadcastChannel === "undefined") return
  const channel = new BroadcastChannel("auth")
  channel.postMessage(message)
  channel.close()
}
