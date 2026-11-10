"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { DiscordIcon } from "@/components/icons/DiscordIcon"
import { OAUTH_LABELS, type OAuthProvider } from "@/lib/auth/providers"
import { callbackWithNext } from "@/lib/auth/oauth-continue"

const GoogleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden>
    <path
      d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
      fill="currentColor"
    />
  </svg>
)

const ICONS: Record<OAuthProvider, () => React.ReactNode> = {
  google: GoogleIcon,
  discord: () => <DiscordIcon width={16} height={16} className="size-4" />,
}

/**
 * "Continue with Google / Discord", for the providers that are configured,
 * then an "or" divider before the email form. Renders nothing when none are.
 * The provider sends people back to /login/callback (or /login?oauth=failed),
 * with `next` when they were connecting an MCP client.
 */
/**
 * Where a failed or cancelled provider sign-in lands: /login, or, while
 * connecting an MCP client, this same login page (its signed request
 * intact), so trying again still finishes connecting.
 */
function failedUrl(next: string | null): string {
  if (!next) return "/login?oauth=failed"
  const here = new URLSearchParams(window.location.search)
  here.set("oauth", "failed")
  return `/login?${here}`
}

export function OAuthButtons({ providers, next = null }: { providers: readonly OAuthProvider[]; next?: string | null }) {
  const t = useTranslations("auth.oauth")
  const [going, setGoing] = useState<OAuthProvider | null>(null)
  if (providers.length === 0) return null

  async function start(provider: OAuthProvider) {
    setGoing(provider)
    try {
      const res = await fetch("/api/identity/sign-in/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, callbackURL: callbackWithNext(next), newUserCallbackURL: callbackWithNext(next), errorCallbackURL: failedUrl(next), disableRedirect: true }),
      })
      const { url } = (await res.json()) as { url?: string }
      if (!res.ok || !url) throw new Error(`sign-in/social answered ${res.status}`)
      // No app session yet: the callback page broadcasts "login" once it exists.
      window.location.href = url
    } catch (err) {
      console.error("[auth] couldn't start OAuth", err)
      toast.error(t("failed", { provider: OAUTH_LABELS[provider] }))
      setGoing(null)
    }
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        {providers.map((p) => {
          const Icon = ICONS[p]
          return (
            <Button key={p} type="button" variant="outline" className="w-full" disabled={going !== null} onClick={() => start(p)}>
              <Icon />
              {going === p ? t("opening", { provider: OAUTH_LABELS[p] }) : t("continueWith", { provider: OAUTH_LABELS[p] })}
            </Button>
          )
        })}
      </div>
      <div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border">
        <span className="relative z-10 bg-card px-2 text-muted-foreground">{t("divider")}</span>
      </div>
    </>
  )
}
