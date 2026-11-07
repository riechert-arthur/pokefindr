import Link from "next/link"
import { ArrowRightIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { formatCount } from "@/components/pokefindr/kinds"
import { HeroSearch } from "./HeroSearch"

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
  return (
    <div className="relative isolate overflow-hidden">
      <div aria-hidden className="hero-bg pointer-events-none absolute inset-0 -z-10">
        {background}
      </div>
      <div className="mx-auto max-w-[760px] px-6 pb-14 pt-32 text-center sm:pt-36">
        <span className="mb-[22px] inline-flex items-center gap-2 rounded-full border border-border bg-card/85 py-1 pl-1.5 pr-3 text-body font-medium text-muted-foreground">
          <Badge className="h-5 rounded-full px-[7px] text-overline tracking-normal shadow-none">New</Badge>
          Search by city, then browse what&apos;s nearby
        </span>
        <h1 className="text-balance text-display text-foreground">
          Find Pokémon Vending Machines <em className="bg-gradient-to-r from-brand to-brand-2 bg-clip-text not-italic text-transparent">Near You</em>
        </h1>
        <p className="mx-auto mt-[18px] max-w-[560px] text-pretty text-body-lg text-muted-foreground">
          Discover the nearest Pokémon card vending machines at Kroger, King Soopers, Safeway and more, and plan your next stop for card collecting.
        </p>
        <HeroSearch />
        <div className="mt-[26px] flex flex-wrap justify-center gap-2.5">
          <Link href="/map" className={buttonVariants({ variant: "outline" })}>
            View full map <ArrowRightIcon className="size-4" aria-hidden />
          </Link>
        </div>
        {stats && (
          <dl className="mt-11 flex flex-wrap justify-center gap-9 text-body text-muted-foreground">
            {[
              [formatCount(stats.vending), "vending machines"],
              [formatCount(stats.states), stats.states === 1 ? "state" : "states"],
              ["1", "country, more coming"],
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
