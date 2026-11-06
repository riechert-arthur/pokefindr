import { ImageResponse } from "next/og"
import { BRAND_MARK_DATA_URI } from "./brand-mark"
import { ogFonts } from "./og-fonts"

export const alt = "PokeFindr: find Pokémon card vending machines near you"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

/** Social preview: the landing hero from the redesign prototype. */
export default async function OpengraphImage() {
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
            <span style={{ fontWeight: 800, color: "#9b2fd9" }}>Findr</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 48, fontSize: 76, fontWeight: 700, lineHeight: 1.02, letterSpacing: "-0.035em" }}>
          <span>Find Pokémon Vending</span>
          <span>
            Machines&nbsp;<span style={{ color: "#c026d3" }}>Near You</span>
          </span>
        </div>
        <div style={{ marginTop: 32, fontSize: 30, color: "#6b6b6b" }}>Card vending machines, card shops and events on one map.</div>
      </div>
    ),
    { ...size, fonts: await ogFonts() },
  )
}
