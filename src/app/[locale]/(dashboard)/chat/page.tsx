import { cookies, headers } from "next/headers"
import { ChatDashboard } from "@/components/assistant/ChatDashboard"
import { CHAT_COOKIE } from "@/lib/assistant/saved-chat"

/**
 * /chat (#391): the conversation with the assistant. The middleware only lets
 * signed-in users here and says who they are. When this browser has their
 * chat saved (#346), the page renders in its conversation layout, so a reload
 * doesn't paint the empty state before the chat is restored.
 */
export default async function ChatPage() {
  const userId = (await headers()).get("x-user-id")
  const savedChatFor = (await cookies()).get(CHAT_COOKIE)?.value
  return <ChatDashboard userId={userId} hasSavedChat={Boolean(userId) && savedChatFor === userId} />
}
