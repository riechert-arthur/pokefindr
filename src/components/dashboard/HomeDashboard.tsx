"use client"

import { Dashboard } from "./Dashboard"
import { AssistantChat } from "@/components/assistant/AssistantChat"

/** The dashboard with the assistant, for the signed-in `userId` (whose chat is kept in this browser, #346). */
export function HomeDashboard({ userId }: { userId: string | null }) {
  return <Dashboard assistant={(p) => <AssistantChat {...p} userId={userId} />} />
}
