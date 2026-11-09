"use client"

import { Dashboard } from "@/components/dashboard/Dashboard"
import { AssistantChat } from "@/components/assistant/AssistantChat"

export default function HomePage() {
  return <Dashboard assistant={(p) => <AssistantChat {...p} />} />
}
