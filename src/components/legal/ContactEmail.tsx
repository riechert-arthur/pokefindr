import { CONTACT_EMAIL } from "@/lib/links"
import { cn } from "@/lib/utils"

/** The contact email address, as a mailto link. */
export function ContactEmail({ className }: { className?: string }) {
  return (
    <a href={`mailto:${CONTACT_EMAIL}`} className={cn("text-primary hover:underline", className)}>
      {CONTACT_EMAIL}
    </a>
  )
}
