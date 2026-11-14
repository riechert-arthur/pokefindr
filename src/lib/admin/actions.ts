import { toast } from "sonner"

/**
 * Sends an admin action as JSON. When the server refuses, shows its reason
 * (or a generic one) and resolves to false; the caller only handles success.
 * A network failure still throws, so callers that word it differently can.
 */
export async function sendAdminAction(url: string, body: unknown, method: "POST" | "PATCH" = "POST"): Promise<boolean> {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
  if (res.ok) return true
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  toast.error(data.error ?? "That didn't work. Try again.")
  return false
}
