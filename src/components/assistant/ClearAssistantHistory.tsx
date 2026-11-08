"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

/** Settings' "Clear assistant history": deletes the stored text of your assistant conversations. */
export function ClearAssistantHistory({ className }: { className?: string }) {
  const [busy, setBusy] = useState(false)
  const clear = async () => {
    setBusy(true)
    try {
      const res = await fetch("/api/assistant/history", { method: "DELETE" })
      if (!res.ok) throw new Error(`DELETE /api/assistant/history failed (${res.status})`)
      toast.success("Assistant history cleared", { description: "The text of your conversations is deleted." })
    } catch (err) {
      console.error("[settings] couldn't clear assistant history", err)
      toast.error("Couldn't clear your history", { description: "Check your connection and try again." })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button type="button" variant="outline" size="sm" className={className} onClick={clear} disabled={busy}>
      {busy ? "Clearing…" : "Clear assistant history"}
    </Button>
  )
}
