import { cookies, headers } from "next/headers"
import { HomeDashboard } from "@/components/dashboard/HomeDashboard"
import { CHAT_COOKIE } from "@/lib/assistant/saved-chat"

/**
 * /home: the dashboard and the way into the assistant, whose conversation is
 * on /chat (#391). The middleware only lets signed-in users here and says who
 * they are. When this browser has their chat saved (#346), the page links back
 * to it.
 */
export default async function HomePage() {
  const userId = (await headers()).get("x-user-id")
  const savedChatFor = (await cookies()).get(CHAT_COOKIE)?.value
  return <HomeDashboard hasSavedChat={Boolean(userId) && savedChatFor === userId} />
}
