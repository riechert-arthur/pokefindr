"use client"

import { Check, Copy } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"

/** What a snippet is, which names it in the Copy button's label and the toasts. */
export type SnippetKind = "url" | "command" | "config"

/** A URL, command or config snippet with a Copy button. */
export function CopyBlock({ text, kind, multiline = false, className }: { text: string; kind: SnippetKind; multiline?: boolean; className?: string }) {
  const t = useTranslations("content.developers.copy")
  const [copied, setCopied] = useState(false)
  const copy = () =>
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true)
        toast.success(t(`${kind}.done`))
        setTimeout(() => setCopied(false), 2000)
      },
      () => toast(t(`${kind}.manual`)),
    )
  return (
    <div className={cn("flex min-w-0 items-start gap-2 rounded-lg border border-border bg-muted p-1.5 pl-3", className)}>
      {multiline ? (
        <pre className="min-w-0 flex-1 overflow-x-auto py-1.5 font-mono text-caption text-foreground">
          <code>{text}</code>
        </pre>
      ) : (
        <code className="min-w-0 flex-1 break-all py-1.5 font-mono text-caption text-foreground">{text}</code>
      )}
      <Button type="button" variant="ghost" size="sm" onClick={copy} aria-label={t(`${kind}.aria`)} className="shrink-0">
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        {copied ? t("copied") : t("copy")}
      </Button>
    </div>
  )
}
