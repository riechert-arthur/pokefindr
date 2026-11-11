import { cookies, headers } from "next/headers"
import { HomeDashboard } from "@/components/dashboard/HomeDashboard"
import { CHAT_COOKIE } from "@/lib/assistant/saved-chat"

/**
 * /home: the dashboard and its assistant. The middleware only lets signed-in
 * users here and says who they are. When this browser has their chat saved
 * (#346), the page renders in its chat layout, so a reload doesn't paint the
 * tiles before the chat is restored.
 */
export default async function HomePage() {
  const userId = (await headers()).get("x-user-id")
  const savedChatFor = (await cookies()).get(CHAT_COOKIE)?.value
  return <HomeDashboard userId={userId} hasSavedChat={Boolean(userId) && savedChatFor === userId} />
}
