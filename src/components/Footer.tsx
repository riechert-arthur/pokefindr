import { Link } from "@/i18n/navigation"
import { useTranslations } from "next-intl"
import { Logo } from "@/components/brand/Logo"
import { SUPPORT_URL } from "@/lib/links"

const LINKS = [
  { name: "map", href: "/map" },
  { name: "blog", href: "/blog" },
  { name: "support", href: SUPPORT_URL },
  { name: "changelog", href: "/changelog" },
  { name: "developers", href: "/developers" },
  { name: "privacy", href: "/privacy-policy" },
  { name: "terms", href: "/terms-of-service" },
] as const

/** The site footer, as in the prototype: the logo, the main links and the not-affiliated notice. */
export function Footer() {
  const t = useTranslations("content")
  return (
    <footer className="border-t border-border bg-background px-6 py-8">
      <div className="mx-auto flex max-w-[1040px] flex-wrap items-center gap-x-8 gap-y-4">
        <Link href="/" aria-label={t("footer.home")} className="-m-1 p-1">
          <Logo variant="full" size={32} />
        </Link>
        <nav aria-label={t("footer.navLabel")} className="flex flex-wrap gap-[18px] text-body">
          {LINKS.map((l) => (
            <Link key={l.name} href={l.href} className="text-muted-foreground hover:text-foreground">
              {t(`nav.${l.name}`)}
            </Link>
          ))}
        </nav>
        <p className="basis-full text-caption text-muted-foreground">
          {t("footer.notice")}
        </p>
      </div>
    </footer>
  )
}
