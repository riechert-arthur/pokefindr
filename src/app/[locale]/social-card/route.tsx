import { ImageResponse } from "next/og"
import { createTranslator, hasLocale } from "next-intl"
import { loadMessages } from "@/i18n/messages"
import { DEFAULT_LOCALE, routing } from "@/i18n/routing"
import { BRAND_MARK_DATA_URI } from "../../brand-mark"
import { ogFonts } from "../../og-fonts"
import { SOCIAL_CARD_SIZE } from "@/i18n/seo"

// Render at build time, once per language: brand-mark.ts reads public/ from disk.
export const dynamic = "force-static"

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

/**
 * The "og" messages for a language. A route handler isn't a Server
 * Component, so this reads the catalog instead of getTranslations.
 */
async function ogMessages(requested: string) {
  const locale = hasLocale(routing.locales, requested) ? requested : DEFAULT_LOCALE
  return createTranslator({ locale, messages: await loadMessages(locale), namespace: "og" })
}

/**
 * The social preview (/social-card, /es/social-card): the landing hero from
 * the redesign prototype, in the page's language. Pages link it through
 * src/i18n/seo.ts.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ locale: string }> }) {
  const t = await ogMessages((await params).locale)
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "72px 88px",
          backgroundColor: "#ffffff",
          backgroundImage: "radial-gradient(60% 70% at 15% 20%, rgba(192,38,211,0.18), transparent 70%), radial-gradient(55% 60% at 85% 15%, rgba(124,58,237,0.16), transparent 70%)",
          color: "#0a0a0a",
          fontFamily: "Noto Sans",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={BRAND_MARK_DATA_URI} width={72} height={72} alt="" />
          <div style={{ display: "flex", fontSize: 44, letterSpacing: "-0.03em" }}>
            <span style={{ fontWeight: 500 }}>Poke</span>
            <span style={{ fontWeight: 800, backgroundImage: "linear-gradient(135deg, #c026d3, #7c3aed)", backgroundClip: "text", color: "transparent" }}>Findr</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 48, fontSize: 76, fontWeight: 700, lineHeight: 1.02, letterSpacing: "-0.035em" }}>
          <span>{t("line1")}</span>
          <span>
            {t("line2")}&nbsp;<span style={{ color: "#c026d3" }}>{t("accent")}</span>
          </span>
        </div>
        <div style={{ marginTop: 32, fontSize: 30, color: "#6b6b6b" }}>{t("subtitle")}</div>
      </div>
    ),
    { ...SOCIAL_CARD_SIZE, fonts: await ogFonts() },
  )
}
