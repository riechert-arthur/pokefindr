"use client"

import { Dashboard } from "./Dashboard"
import { AssistantChat } from "@/components/assistant/AssistantChat"

/** The dashboard with the assistant, for the signed-in `userId`, whose chat is kept in this browser (#346). */
export function HomeDashboard({ userId, hasSavedChat }: { userId: string | null; hasSavedChat: boolean }) {
  return <Dashboard initialChatting={hasSavedChat} assistant={(p) => <AssistantChat {...p} userId={userId} />} />
}
