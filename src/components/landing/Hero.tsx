import { Badge } from "@/components/ui/badge"
import { HeroSearch, ViewMapLink } from "./HeroSearch"
import { useFormat } from "@/i18n/format"
import { useTranslations } from "next-intl"

export interface HeroStats {
  vending: number
  states: number
}

/**
 * The landing hero, as in the prototype: headline, the search that opens the
 * map (Flow 1), quick picks, a way to browse, and live counts. The header
 * floats over it, so the background runs behind the nav.
 */
export function Hero({ stats, background }: { stats: HeroStats | null; background?: React.ReactNode }) {
  const f = useFormat()
  const t = useTranslations("landing.hero")
  return (
    <div className="relative isolate overflow-hidden">
      <div aria-hidden className="hero-bg pointer-events-none absolute inset-0 -z-10">
        {background}
      </div>
      <div className="mx-auto max-w-[760px] px-6 pb-14 pt-32 text-center sm:pt-36">
        <span className="mb-[22px] inline-flex items-center gap-2 rounded-full border border-border bg-card/85 py-1 pl-1.5 pr-3 text-body font-medium text-muted-foreground">
          <Badge className="h-5 rounded-full px-[7px] text-overline tracking-normal shadow-none">{t("new")}</Badge>
          {t("eyebrow")}
        </span>
        <h1 className="text-balance text-display text-foreground">
          {t.rich("title", { em: (chunks) => <em className="bg-gradient-to-r from-brand to-brand-2 bg-clip-text not-italic text-transparent">{chunks}</em> })}
        </h1>
        <p className="mx-auto mt-[18px] max-w-[560px] text-pretty text-body-lg text-muted-foreground">
          {t("body")}
        </p>
        <HeroSearch />
        <div className="mt-[26px] flex flex-wrap justify-center gap-2.5">
          <ViewMapLink />
        </div>
        {stats && (
          <dl className="mt-11 flex flex-wrap justify-center gap-9 text-body text-muted-foreground">
            {[
              [f.count(stats.vending), t("stats.vending")],
              [f.count(stats.states), t("stats.states", { count: stats.states })],
              [f.count(1), t("stats.countries")],
            ].map(([n, label]) => (
              <div key={label} className="flex flex-col-reverse">
                <dt>{label}</dt>
                <dd className="text-[24px] font-bold tabular-nums tracking-tight text-foreground">{n}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  )
}
