"use client"

import { useTransition } from "react"
import { GlobeIcon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import { useOptionalSession } from "@/components/providers/SessionProvider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { usePathname, useRouter } from "@/i18n/navigation"
import { PUBLIC_LOCALES, type Locale } from "@/i18n/routing"
import { cn } from "@/lib/utils"

/** "English", "Español": a language in its own name, as people look for it. */
export function languageName(locale: Locale): string {
  const name = new Intl.DisplayNames([locale], { type: "language" }).of(locale) ?? locale
  return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1)
}

interface LanguageSwitcherProps {
  /** "full" for settings: the language's name. "compact" for the footer and app rail: a globe and the code. */
  variant?: "full" | "compact"
  /** The languages offered; the public ones unless a story says otherwise. Hidden with fewer than two. */
  locales?: readonly Locale[]
  className?: string
}

/**
 * Picks the page's language (#182). The same page and query open in the new
 * language (`/map?state=WA` → `/es/map?state=WA`), next-intl keeps the choice
 * in the language cookie, and a signed-in person's profile keeps it for their
 * other devices.
 */
export function LanguageSwitcher({ locales = PUBLIC_LOCALES, ...props }: LanguageSwitcherProps) {
  return locales.length < 2 ? null : <Switcher locales={locales} {...props} />
}

function Switcher({ variant = "full", locales, className }: LanguageSwitcherProps & { locales: readonly Locale[] }) {
  const locale = useLocale()
  const t = useTranslations("ui.language")
  const router = useRouter()
  const pathname = usePathname()
  const session = useOptionalSession()
  const [pending, startTransition] = useTransition()

  const choose = (next: string) => {
    if (next === locale || !locales.includes(next as Locale)) return
    // Read at the click: useSearchParams would make static pages render on the client.
    const href = `${pathname}${window.location.search}`
    startTransition(() => router.replace(href, { locale: next as Locale }))
    if (!session) return
    fetch("/api/user-settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale: next }) })
      .then((res) => {
        if (!res.ok) throw new Error(`PATCH /api/user-settings failed (${res.status})`)
      })
      .catch((err: unknown) => {
        console.error("[language] couldn't save the language", err)
        toast.error(t("saveFailed"), { description: t("saveFailedBody") })
      })
  }

  return (
    <Select value={locale} onValueChange={choose} disabled={pending}>
      <SelectTrigger
        aria-label={t("label")}
        className={cn(variant === "compact" ? "h-8 w-auto gap-1.5 px-2 text-caption uppercase" : "w-48", className)}
      >
        {variant === "compact" && <GlobeIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
        {variant === "compact" ? <span>{locale}</span> : <SelectValue />}
      </SelectTrigger>
      <SelectContent>
        {locales.map((l) => (
          <SelectItem key={l} value={l} lang={l}>
            {languageName(l)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
