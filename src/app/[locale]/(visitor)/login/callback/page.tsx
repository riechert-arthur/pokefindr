"use client"

import { useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { Link, useRouter } from "@/i18n/navigation"
import { buttonVariants } from "@/components/ui/button"
import { AuthPage } from "@/components/forms/AuthPage"
import { CallbackForm } from "@/components/forms/CallbackForm"
import { LoadSpinner } from "@/components/wrappers/LoadSpinner"
import { broadcastAuth } from "@/lib/auth/broadcast"
import { safeNext } from "@/lib/auth/oauth-continue"

type Step = "checking" | "onboarding" | "failed"

/**
 * Where Google or Discord send people back (via Better Auth, which has set
 * its session cookie). An existing user goes straight to /home; a new one
 * picks a username first. Someone connecting an MCP client goes back to its
 * authorization instead (`next`).
 */
export default function OAuthCallback() {
  const router = useRouter()
  const t = useTranslations("auth.callback")
  const [step, setStep] = useState<Step>("checking")
  const [next, setNext] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const target = safeNext(new URLSearchParams(window.location.search).get("next"))
    setNext(target)
    fetch("/api/auth/callback", { method: "POST" })
      .then((res) => {
        if (res.status === 200) {
          broadcastAuth("login")
          if (target) window.location.assign(target)
          else router.push("/home")
        } else setStep(res.status === 204 ? "onboarding" : "failed")
      })
      .catch(() => setStep("failed"))
  }, [router])

  if (step === "checking") return <LoadSpinner text={t("checking")} />
  return (
    <AuthPage>
      {step === "onboarding" ? (
        <CallbackForm next={next} />
      ) : (
        <div className="grid gap-4 text-center" role="alert">
          <p className="text-body text-foreground">{t("failed")}</p>
          <Link href="/login" className={buttonVariants()}>
            {t("backToLogin")}
          </Link>
        </div>
      )}
    </AuthPage>
  )
}
