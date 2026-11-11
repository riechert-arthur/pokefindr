"use client"

import { useEffect, useRef, useTransition } from "react"
import axios from "axios"
import { GlobeIcon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import { useOptionalSession, useOptionalSessionLoading } from "@/components/providers/SessionProvider"
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
  /**
   * "full" for settings: the language's name. "compact" for the footer: a
   * globe and the code. "rail" for the app rail: a globe, then the language's
   * name in `labelClassName` (hidden while the rail is collapsed).
   */
  variant?: "full" | "compact" | "rail"
  /** The languages offered; the public ones unless a story says otherwise. Hidden with fewer than two. */
  locales?: readonly Locale[]
  /** The trigger's down arrow; off in the narrow app rail. */
  chevron?: boolean
  /** When the list opens or closes (the app rail stays expanded while it's open). */
  onOpenChange?: (open: boolean) => void
  className?: string
  labelClassName?: string
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

function Switcher({ variant = "full", locales, chevron = true, onOpenChange, className, labelClassName }: LanguageSwitcherProps & { locales: readonly Locale[] }) {
  const locale = useLocale()
  const t = useTranslations("ui.language")
  const router = useRouter()
  const pathname = usePathname()
  const session = useOptionalSession()
  const sessionLoading = useOptionalSessionLoading()
  const [pending, startTransition] = useTransition()
  // A choice made before the session loaded, saved once it has (if signed in).
  const unsaved = useRef<Locale | null>(null)

  const save = (picked: Locale) => {
    axios.patch("/api/user-settings", { locale: picked }, { withCredentials: true }).catch((err: unknown) => {
      console.error("[language] couldn't save the language", err)
      toast.error(t("saveFailed"), { description: t("saveFailedBody") })
    })
  }

  useEffect(() => {
    if (sessionLoading || !unsaved.current) return
    if (session) save(unsaved.current)
    unsaved.current = null
    // Only when the session finishes loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLoading, session])

  const choose = (value: string) => {
    if (value === locale || !locales.includes(value as Locale)) return
    const picked = value as Locale
    // Read at the click: useSearchParams would make static pages render on the client.
    const href = `${pathname}${window.location.search}${window.location.hash}`
    startTransition(() => router.replace(href, { locale: picked }))
    if (session) save(picked)
    else if (sessionLoading) unsaved.current = picked
  }

  const name = languageName(locale as Locale)
  return (
    <Select value={locale} onValueChange={choose} onOpenChange={onOpenChange} disabled={pending}>
      {variant === "rail" ? (
        // A rail row: no border or arrow. The name includes the label it shows.
        <SelectTrigger chevron={false} aria-label={t("current", { language: name })} className={cn("justify-start border-0 shadow-none", className)}>
          <GlobeIcon className="size-5 shrink-0" aria-hidden />
          <span className={labelClassName}>{name}</span>
        </SelectTrigger>
      ) : (
        <SelectTrigger
          chevron={chevron}
          aria-label={t("label")}
          className={cn(variant === "compact" ? "h-8 w-auto gap-1.5 px-2 text-caption uppercase" : "w-48", className)}
        >
          {variant === "compact" && <GlobeIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
          {variant === "compact" ? <span>{locale}</span> : <SelectValue />}
        </SelectTrigger>
      )}
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
