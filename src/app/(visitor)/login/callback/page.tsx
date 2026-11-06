"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CallbackForm } from "@/components/forms/CallbackForm"
import { Logo } from "@/components/brand/Logo"
import Link from "next/link";
import axios from "axios";
import { LoadSpinner } from "@/components/wrappers/LoadSpinner";

export default function OAuthCallback() {
  const router = useRouter();
  const [loading, setLoading] = useState(true)
  const [onboarding, setOnboarding] = useState(false)

  useEffect(() => {
    const doOAuth = async () => {
      const hashFragment = window.location.hash.substring(1);
      const params = new URLSearchParams(hashFragment);
      const accessToken = params.get("access_token");

      if (!accessToken) {
        throw Error("No access token!") 
      }

      try {

        console.log("Run once")
        const { status } = await axios.post(
          "/api/auth/callback",
          { access_token: accessToken },
          { withCredentials: true }         
        )

        if (status === 200) { 
          new BroadcastChannel("auth").postMessage("login");
          router.push("/home")
          return
        }
        setOnboarding(true)
        setLoading(false)
      } catch (err) {
        throw err 
      }
    };

    if (!onboarding) doOAuth();
  }, [router]);

  if (loading) {
    return <LoadSpinner text="Logging you in..." />
  } else {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
        <div className="z-1000 flex w-full max-w-sm flex-col gap-6">
          <Link href="/" className="flex items-center gap-2 self-center font-medium">
            <Logo variant="full" size={28} />
          </Link>
          <CallbackForm /> 
        </div>
      </div>
    )
  }
}

