import Link from "next/link"
import { buttonVariants } from "@/components/ui/Button"

export default function Example() {
  return (
    <>
      <main className="grid min-h-full place-items-center bg-background px-6 py-24 sm:py-32 lg:px-8">
        <div className="text-center">
          <p className="text-base font-semibold text-primary">404</p>
          <h1 className="mt-4 text-display text-foreground">
            Page not found
          </h1>
          <p className="mt-6 text-pretty text-body-lg text-muted-foreground">
            Sorry, we couldn’t find the page you’re looking for.
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
