import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"

export default function ConfirmEmailPage() {
  return (
    <>
      <main className="grid h-screen place-items-center bg-background px-6 py-24 sm:py-32 lg:px-8">
        <div className="text-center">
          <h1 className="mt-4 text-display text-foreground">
            Check your email
          </h1>
          <p className="mt-6 max-w-prose text-pretty text-body-lg text-muted-foreground">
            We&apos;ve sent you a link to confirm your account. It works for 24 hours. No email? Check spam, or log in and we&apos;ll send another.
          </p>
          <div className="mt-10 flex items-center justify-center gap-x-6">
            <Link
              href="/login"
              className={buttonVariants({ size: "lg" })}
            >
              Go to login
            </Link>
            <Link href="https://discord.gg/f2uUR5bAZU" className="text-sm font-semibold text-foreground">
              Contact support <span aria-hidden="true">&rarr;</span>
            </Link>
          </div>
        </div>
      </main>
    </>
  )
}
