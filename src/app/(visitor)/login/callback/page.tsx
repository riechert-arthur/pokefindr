"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { buttonVariants } from "@/components/ui/button"
import { AuthPage } from "@/components/forms/AuthPage"
import { CallbackForm } from "@/components/forms/CallbackForm"
import { LoadSpinner } from "@/components/wrappers/LoadSpinner"
import { broadcastAuth } from "@/lib/auth/broadcast"

type Step = "checking" | "onboarding" | "failed"

/**
 * Where Google or Discord send people back (via Better Auth, which has set
 * its session cookie). An existing user goes straight to /home; a new one
 * picks a username first.
 */
export default function OAuthCallback() {
  const router = useRouter()
  const [step, setStep] = useState<Step>("checking")
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    fetch("/api/auth/callback", { method: "POST" })
      .then((res) => {
        if (res.status === 200) {
          broadcastAuth("login")
          router.push("/home")
        } else setStep(res.status === 204 ? "onboarding" : "failed")
      })
      .catch(() => setStep("failed"))
  }, [router])

  if (step === "checking") return <LoadSpinner text="Logging you in..." />
  return (
    <AuthPage>
      {step === "onboarding" ? (
        <CallbackForm />
      ) : (
        <div className="grid gap-4 text-center" role="alert">
          <p className="text-body text-foreground">That sign-in didn&apos;t go through.</p>
          <Link href="/login" className={buttonVariants()}>
            Back to login
          </Link>
        </div>
      )}
    </AuthPage>
  )
}
