"use client"

import { useState } from "react"
import { Check } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LoadingButton } from "@/components/wrappers/LoadingButton"

/**
 * "Allow <app> to use your PokeFindr account?" for an MCP client (#134).
 * Either answer goes to Better Auth's consent endpoint with the signed
 * request from this page's query; it answers with where to go next (back
 * to the app, with a code or with access_denied).
 */
export function ConsentForm({ client, username, permissions }: { client: { name: string; redirectHost: string }; username: string; permissions: string[] }) {
  const t = useTranslations("auth.consent")
  const [sending, setSending] = useState<"allow" | "deny" | null>(null)

  async function answer(accept: boolean) {
    setSending(accept ? "allow" : "deny")
    try {
      const res = await fetch("/api/identity/oauth2/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept, oauth_query: window.location.search.slice(1) }),
      })
      const body = (await res.json().catch(() => null)) as { url?: string } | null
      if (!res.ok || !body?.url) throw new Error(`consent answered ${res.status}`)
      window.location.assign(body.url)
    } catch (err) {
      console.error("[oauth] consent failed", err)
      toast.error(t("failed"))
      setSending(null)
    }
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">{t("title", { app: client.name })}</CardTitle>
        <CardDescription>
          {t.rich("description", { username, user: (chunks) => <span className="font-medium text-foreground">{chunks}</span> })}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div className="grid gap-2">
          <p className="text-sm font-medium text-foreground">{t("canDo")}</p>
          <ul className="grid gap-2">
            {permissions.map((p) => (
              <li key={p} className="flex items-start gap-2 text-sm text-muted-foreground">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
          {t.rich("warning", { host: client.redirectHost, b: (chunks) => <span className="font-medium text-foreground">{chunks}</span> })}
        </p>
        <div className="grid gap-3">
          <LoadingButton type="button" className="w-full" pending={sending === "allow"} pendingLabel={t("allowing")} disabled={sending !== null} onClick={() => answer(true)}>
            {t("allow")}
          </LoadingButton>
          <Button type="button" variant="outline" className="w-full" disabled={sending !== null} onClick={() => answer(false)}>
            {sending === "deny" ? t("cancelling") : t("cancel")}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
