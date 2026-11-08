"use client"

import { useEffect, useState } from "react"
import { Dashboard } from "@/components/dashboard/Dashboard"
import { Composer } from "@/components/assistant/Composer"

/** The composer before it talks to the assistant (#132 connects it): suggestions fill it in. */
function ComposerPreview({ suggestion, onSuggestionUsed }: { suggestion: string | null; onSuggestionUsed: () => void }) {
  const [text, setText] = useState("")
  useEffect(() => {
    if (!suggestion) return
    setText(suggestion)
    onSuggestionUsed()
  }, [suggestion, onSuggestionUsed])
  return (
    <div>
      <Composer value={text} onChange={setText} onSubmit={() => {}} placeholder="Ask about machines, shops or events…" />
      <p className="mt-2 text-center text-caption text-muted-foreground">Distances are straight-line. Answers can be wrong, so check the map.</p>
    </div>
  )
}

export default function HomePage() {
  return <Dashboard assistant={(p) => <ComposerPreview suggestion={p.suggestion} onSuggestionUsed={p.onSuggestionUsed} />} />
}
