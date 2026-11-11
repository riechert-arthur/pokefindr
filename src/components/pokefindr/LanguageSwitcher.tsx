"use client"

import { useEffect, useRef, useTransition } from "react"
import axios from "axios"
import { GlobeIcon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import { useOptionalSession, useOptionalSessionLoading } from "@/components/providers/SessionProvider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { COMPACT_TRIGGER, CompactLabel } from "@/components/pokefindr/CompactSelect"
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
  /** The trigger's down arrow; on unless a caller has no room for it. */
  chevron?: boolean
  /** When the list opens or closes (the app rail stays expanded while it's open). */
  onOpenChange?: (open: boolean) => void
  className?: string
  /**
   * Compact only: render both the code ("EN") and the language's name
   * ("English"), each with its classes, so a caller can switch between them
   * (the app rail shows the name when expanded). Without it, the code alone.
   */
  labelClassNames?: { code: string; name: string }
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

function Switcher({ variant = "full", locales, chevron = true, onOpenChange, className, labelClassNames }: LanguageSwitcherProps & { locales: readonly Locale[] }) {
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

  return (
    <Select value={locale} onValueChange={choose} onOpenChange={onOpenChange} disabled={pending}>
      <SelectTrigger
        chevron={chevron}
        // Compact shows only a code or a name, so its name says both what it is and the choice.
        aria-label={variant === "compact" ? t("current", { language: languageName(locale as Locale) }) : t("label")}
        className={cn(variant === "compact" ? COMPACT_TRIGGER : "w-48", className)}
      >
        {variant === "compact" && <GlobeIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
        {variant === "compact" ? (
          <CompactLabel>
            <span className={cn("uppercase", labelClassNames?.code)}>{locale}</span>
            {labelClassNames && <span className={labelClassNames.name}>{languageName(locale as Locale)}</span>}
          </CompactLabel>
        ) : (
          <SelectValue />
        )}
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
