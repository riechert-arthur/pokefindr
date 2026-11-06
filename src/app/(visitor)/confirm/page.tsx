import Link from "next/link"
import { buttonVariants } from "@/components/ui/Button"

export default function ConfirmEmailPage() {
  return (
    <>
      <main className="grid h-screen place-items-center bg-background px-6 py-24 sm:py-32 lg:px-8">
        <div className="text-center">
          <h1 className="mt-4 text-display text-foreground">
            Thank you! 
          </h1>
          <p className="mt-6 text-pretty text-body-lg text-muted-foreground">
            A confirmation has been sent to your email. 
          </p>
          <div className="mt-10 flex items-center justify-center gap-x-6">
            <Link
              href="/"
              className={buttonVariants({ size: "lg" })}
            >
              Go back home
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
