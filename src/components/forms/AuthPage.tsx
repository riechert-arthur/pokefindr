import Link from "next/link"
import type { ReactNode } from "react"
import { Logo } from "@/components/brand/Logo"

/** The layout of the login, sign-up and password pages: the logo above one card. */
export function AuthPage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="z-1000 flex w-full max-w-sm flex-col gap-6">
        <Link href="/" className="flex items-center gap-2 self-center font-medium">
          <Logo variant="full" size={28} />
        </Link>
        {children}
      </div>
    </div>
  )
}
