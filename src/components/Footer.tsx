import { Link } from "@/i18n/navigation"
import { useTranslations } from "next-intl"
import { Logo } from "@/components/brand/Logo"
import { SITE_LINKS, type SiteLink } from "@/lib/links"
import { LanguageSwitcher } from "@/components/pokefindr/LanguageSwitcher"

const LINKS: SiteLink[] = ["map", "blog", "support", "changelog", "developers", "privacy", "terms"]

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
          {LINKS.map((name) => (
            <Link key={name} href={SITE_LINKS[name]} className="text-muted-foreground hover:text-foreground">
              {t(`nav.${name}`)}
            </Link>
          ))}
        </nav>
        <LanguageSwitcher variant="compact" className="ml-auto" />
        <p className="basis-full text-caption text-muted-foreground">
          {t("footer.notice")}
        </p>
      </div>
    </footer>
  )
}
