"use client"

import { useState } from "react"
import { Check } from "lucide-react"
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
export function ConsentForm({ client, username, permissions }: { client: { name: string; redirectHost: string | null; uri: string | null }; username: string; permissions: string[] }) {
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
      toast.error("That didn't go through. Start connecting from the app again.")
      setSending(null)
    }
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Connect {client.name}?</CardTitle>
        <CardDescription>
          It wants to use your PokeFindr account, <span className="font-medium text-foreground">@{username}</span>.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div className="grid gap-2">
          <p className="text-sm font-medium text-foreground">It will be able to:</p>
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
          {client.redirectHost ? (
            <>
              Allowing sends you back to <span className="font-medium text-foreground">{client.redirectHost}</span>. Only allow it if you just asked an app to connect.
            </>
          ) : (
            "Only allow it if you just asked an app to connect."
          )}{" "}
          It can never see your password. Disconnect it any time from the app.
        </p>
        <div className="grid gap-3">
          {sending === "allow" ? (
            <LoadingButton className="w-full">Connecting…</LoadingButton>
          ) : (
            <Button type="button" className="w-full" disabled={sending !== null} onClick={() => answer(true)}>
              Allow
            </Button>
          )}
          <Button type="button" variant="outline" className="w-full" disabled={sending !== null} onClick={() => answer(false)}>
            {sending === "deny" ? "Cancelling…" : "Cancel"}
          </Button>
        </div>
        {client.uri && (
          <p className="text-center text-sm text-muted-foreground">
            About this app:{" "}
            <a href={client.uri} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-4">
              {new URL(client.uri).host}
            </a>
          </p>
        )}
      </CardContent>
    </Card>
  )
}
