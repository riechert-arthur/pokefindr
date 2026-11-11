"use client"

import { useState } from "react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { clearAllChats } from "@/lib/assistant/saved-chat"

/** Settings' "Clear assistant history": deletes the stored text of your assistant conversations. */
export function ClearAssistantHistory({ className }: { className?: string }) {
  const t = useTranslations("assistant.clearHistory")
  const [busy, setBusy] = useState(false)
  const clear = async () => {
    setBusy(true)
    try {
      const res = await fetch("/api/assistant/history", { method: "DELETE" })
      if (!res.ok) throw new Error(`DELETE /api/assistant/history failed (${res.status})`)
      // And the current chat kept in this browser (#346).
      clearAllChats()
      toast.success(t("done"), { description: t("doneBody") })
    } catch (err) {
      console.error("[settings] couldn't clear assistant history", err)
      toast.error(t("failed"), { description: t("failedBody") })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button type="button" variant="outline" size="sm" className={className} onClick={clear} disabled={busy}>
      {busy ? t("clearing") : t("button")}
    </Button>
  )
}
