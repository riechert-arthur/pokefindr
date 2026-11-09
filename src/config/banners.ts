/**
 * Sponsored banners (#59): what each says, where it links, and where it may
 * show. Adding or rotating one is an edit here, not new numbered env vars.
 * Links and pixels are public (they're in the page), so a new banner can use
 * literal URLs; the first one keeps reading the env vars it always had
 * (through publicConfig), so production needs no change.
 */
import { publicConfig } from "@/config.public"

/** Where an in-content sponsored slot can appear (#136). */
export const SPONSOR_PLACEMENTS = ["results", "details", "landing"] as const
export type SponsorPlacement = (typeof SPONSOR_PLACEMENTS)[number]

export interface Banner {
  id: string
  /** Shown as "Sponsored · <sponsor>". */
  sponsor: string
  title: string
  body?: string
  /** The link's words, e.g. "See the deal". */
  cta: string
  /** The affiliate link; a banner without one never shows. */
  href: string | undefined
  /** An impression pixel, loaded once when the banner shows. */
  pixel?: string
  /** The image the floating banner shows. */
  image?: string
  /** Relative chance of being picked among the banners for a placement. */
  weight: number
  /** Where it may show; all placements when omitted. */
  placements?: readonly SponsorPlacement[]
}

export const BANNERS: readonly Banner[] = [
  {
    id: "tcgplayer-singles",
    sponsor: "TCGplayer",
    title: "Missed the restock? Buy singles online",
    body: "10% off qualifying purchases on TCGplayer.",
    cta: "See the deal",
    href: publicConfig.sponsor.link,
    pixel: publicConfig.sponsor.pixel,
    image: publicConfig.sponsor.image,
    weight: 1,
  },
]

/** The banners that may show in `placement`: with a link, a positive weight, and the placement allowed. */
export function bannersFor(placement: SponsorPlacement, banners: readonly Banner[] = BANNERS): Banner[] {
  return banners.filter((b) => Boolean(b.href) && b.weight > 0 && (!b.placements || b.placements.includes(placement)))
}

/** One banner for `placement`, picked by weight, or null when none may show. */
export function pickBanner(placement: SponsorPlacement, banners: readonly Banner[] = BANNERS, random = Math.random): Banner | null {
  const options = bannersFor(placement, banners)
  const total = options.reduce((n, b) => n + b.weight, 0)
  let at = random() * total
  for (const b of options) {
    at -= b.weight
    if (at < 0) return b
  }
  return options.at(-1) ?? null
}
