import type { ReactNode } from "react"

/** A numbered section's heading in a legal page. */
export function LegalHeading({ children }: { children: ReactNode }) {
  return <h2 className="text-2xl font-semibold mt-8 mb-4">{children}</h2>
}
