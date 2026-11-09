import { describe, expect, it } from "vitest"
import { bannersFor, pickBanner, type Banner } from "@/config/banners"

const banner = (over: Partial<Banner>): Banner => ({ id: "a", sponsor: "S", title: "T", cta: "Go", href: "https://example.com", weight: 1, ...over })

describe("banners", () => {
  it("only offers banners with a link, a weight, and the placement allowed", () => {
    const list = [
      banner({ id: "all" }),
      banner({ id: "no-link", href: undefined }),
      banner({ id: "off", weight: 0 }),
      banner({ id: "landing-only", placements: ["landing"] }),
    ]
    expect(bannersFor("results", list).map((b) => b.id)).toEqual(["all"])
    expect(bannersFor("landing", list).map((b) => b.id)).toEqual(["all", "landing-only"])
  })

  it("picks by weight, and nothing when none may show", () => {
    const list = [banner({ id: "a", weight: 1 }), banner({ id: "b", weight: 3 })]
    expect(pickBanner("details", list, () => 0)?.id).toBe("a")
    expect(pickBanner("details", list, () => 0.24)?.id).toBe("a")
    expect(pickBanner("details", list, () => 0.26)?.id).toBe("b")
    expect(pickBanner("details", list, () => 0.999)?.id).toBe("b")
    expect(pickBanner("details", [banner({ href: undefined })])).toBeNull()
  })
})
