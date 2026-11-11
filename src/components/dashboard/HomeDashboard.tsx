"use client"

import { Dashboard } from "./Dashboard"
import { AssistantEntry } from "@/components/assistant/AssistantEntry"

/** /home: the dashboard, with the way into the assistant; `hasSavedChat` links back to a saved conversation on /chat (#391). */
export function HomeDashboard({ userId, hasSavedChat }: { userId: string | null; hasSavedChat: boolean }) {
  return <Dashboard assistant={(p) => <AssistantEntry {...p} userId={userId} hasSavedChat={hasSavedChat} />} />
}
