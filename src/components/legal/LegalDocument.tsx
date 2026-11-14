import type { ComponentProps, ReactNode } from "react"
import { EnglishOnlyNotice } from "@/components/EnglishOnlyNotice"

type LegalDocumentProps = {
  /** The page's own address, for the notice's link to the English page. */
  href: ComponentProps<typeof EnglishOnlyNotice>["href"]
  title: string
  /** When the document last changed, as written, e.g. "November 9, 2026". */
  updated: string
  children: ReactNode
}

/** A legal page, in English only: the notice for other languages, the title and the "Last updated" date, then the document. */
export function LegalDocument({ href, title, updated, children }: LegalDocumentProps) {
  return (
    <div lang="en" className="max-w-3xl mx-auto p-6 text-foreground">
      <EnglishOnlyNotice href={href} />
      <h1 className="text-3xl font-bold mb-4">{title}</h1>
      <p className="mb-4">Last updated {updated}</p>
      {children}
    </div>
  )
}
