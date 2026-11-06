"use client"

import Link from "next/link"
import { useEffect } from "react"
import { buttonVariants } from "@/components/ui/Button"

export default function GlobalError({
  error,
}: {
    error: Error
    reset: () => void
}) {

  useEffect(() => console.error(error), [error])

  return (
    <>
      <main className="grid min-h-full place-items-center bg-background px-6 py-24 sm:py-32 lg:px-8">
        <div className="text-center">
          <p className="text-base font-semibold text-primary">Error</p>
          <h1 className="mt-4 text-display text-foreground">
            Something went wrong
          </h1>
          <p className="mt-6 text-pretty text-body-lg text-muted-foreground">
            {error.message} 
          </p>
          <div className="mt-10 flex items-center justify-center gap-x-6">
            <Link
              href="/"
              className={buttonVariants({ size: "lg" })}
            >
              Go back home
            </Link>
            <Link href="https://discord.gg/f2uUR5bAZU" target="_top" className="text-sm font-semibold text-foreground">
              Contact support <span aria-hidden="true">&rarr;</span>
            </Link>
          </div>
        </div>
      </main>
    </>
  )
}
