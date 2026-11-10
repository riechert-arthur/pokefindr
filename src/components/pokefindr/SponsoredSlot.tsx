"use client"

import { XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface SponsoredSlotProps {
  sponsor: string
  title: string
  body?: string
  cta: string
  href: string
  /** "compact": inside lists and panels (the whole card is the link). "strip": full-width between page sections, with a button. */
  variant?: "compact" | "strip"
  onDismiss?: () => void
  /** Called when the sponsor's link is followed (for analytics). */
  onFollow?: () => void
  className?: string
}

/**
 * The shell for one in-content sponsored slot: always labeled "Sponsored",
 * styled apart from location rows, dismissible. Choosing what to show and
 * when (one per view, never on the map or in forms) belongs to the ads work
 * (#136); this only renders it.
 */
export function SponsoredSlot({ sponsor, title, body, cta, href, variant = "compact", onDismiss, onFollow, className }: SponsoredSlotProps) {
  const t = useTranslations("ads")
  const strip = variant === "strip"
  return (
    <aside
      // Named by its title, so several slots on a page are distinct landmarks.
      aria-label={t("landmark", { title })}
      data-variant={variant}
      className={cn(
        "relative flex items-center gap-3 rounded-lg border border-border bg-muted p-3 text-body",
        strip && "pl-4 py-3.5",
        className,
        // Last, so a caller's p-* can't remove the room the dismiss button needs.
        onDismiss && "pr-9",
      )}
    >
      <span aria-hidden className="h-11 w-[2.125rem] shrink-0 -rotate-6 rounded-md bg-gradient-to-br from-brand to-brand-2 shadow-sm ring-[3px] ring-inset ring-background/70" />
      <span className="min-w-0 flex-1">
        <span className="block text-overline uppercase text-muted-foreground">{t("label", { sponsor })}</span>
        {/* The strip's CTA button is its link, so the title isn't a second one. */}
        {strip ? (
          <span className="block font-semibold text-foreground">{title}</span>
        ) : (
          <a href={href} target="_blank" rel="sponsored nofollow noopener" onClick={onFollow} className="block font-semibold text-foreground after:absolute after:inset-0">
            {title}
          </a>
        )}
        {body && <span className="block text-muted-foreground">{body}</span>}
        {!strip && <span className="mt-1 block font-semibold text-primary">{cta} →</span>}
      </span>
      {strip && (
        <a href={href} target="_blank" rel="sponsored nofollow noopener" onClick={onFollow} className={buttonVariants({ variant: "outline", size: "sm" })}>
          {cta}
        </a>
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t("dismiss")}
          className="absolute right-1 top-1 z-10 grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
        >
          <XIcon className="size-3.5" aria-hidden />
        </button>
      )}
    </aside>
  )
}
