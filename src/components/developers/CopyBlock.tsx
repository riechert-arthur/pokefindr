"use client"

import { Check, Copy } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** A URL, command or config snippet with a Copy button. */
export function CopyBlock({ text, label, multiline = false, className }: { text: string; label: string; multiline?: boolean; className?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () =>
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true)
        toast.success(`${label} copied`)
        setTimeout(() => setCopied(false), 2000)
      },
      () => toast(`Copy the ${label.toLowerCase()} by hand`),
    )
  return (
    <div className={cn("flex min-w-0 items-start gap-2 rounded-lg border border-border bg-muted p-1.5 pl-3", className)}>
      {multiline ? (
        <pre className="min-w-0 flex-1 overflow-x-auto py-1.5 font-mono text-caption text-foreground">
          <code>{text}</code>
        </pre>
      ) : (
        <code className="min-w-0 flex-1 truncate py-1.5 font-mono text-caption text-foreground">{text}</code>
      )}
      <Button type="button" variant="ghost" size="sm" onClick={copy} aria-label={`Copy ${label.toLowerCase()}`} className="shrink-0">
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  )
}
