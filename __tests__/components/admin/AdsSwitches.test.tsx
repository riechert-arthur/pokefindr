import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { AdsSwitches } from "@/components/admin/AdsSwitches"

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("AdsSwitches", () => {
  it("shows a switch per placement with its state, the rules and the sponsor, and flips one", async () => {
    let placements = { results: true, details: true, landing: false }
    const calls: { url: string; body?: unknown }[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          const body = JSON.parse(String(init.body))
          calls.push({ url, body })
          placements = { ...placements, details: body.enabled }
          return new Response(JSON.stringify({ ok: true }))
        }
        return new Response(JSON.stringify({ placements, sponsors: ["TCGplayer"] }))
      }),
    )
    render(<AdsSwitches />)
    const details = await screen.findByRole("switch", { name: "Location details" })
    expect(details).toHaveAttribute("aria-checked", "true")
    expect(screen.getByRole("switch", { name: "Landing page strip" })).toHaveAttribute("aria-checked", "false")
    expect(within(screen.getByRole("region", { name: "Landing page strip" })).getByText("Off")).toBeInTheDocument()
    expect(screen.getByText(/Current sponsor: TCGplayer\./)).toBeInTheDocument()
    fireEvent.click(details)
    await waitFor(() => expect(screen.getByRole("switch", { name: "Location details" })).toHaveAttribute("aria-checked", "false"))
    expect(calls).toEqual([{ url: "/api/admin/ads/details", body: { enabled: false } }])
  })

  it("keeps focus on the switch while the change saves, and ignores presses until it's done", async () => {
    let finish: (r: Response) => void = () => {}
    const post = vi.fn(() => new Promise<Response>((resolve) => (finish = resolve)))
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) =>
        init?.method === "POST" ? post() : new Response(JSON.stringify({ placements: { results: true, details: true, landing: false }, sponsors: [] })),
      ),
    )
    render(<AdsSwitches />)
    const results = await screen.findByRole("switch", { name: "Map results list" })
    results.focus()
    fireEvent.click(results)
    await waitFor(() => expect(results).toHaveAttribute("aria-disabled", "true"))
    expect(results).not.toBeDisabled()
    expect(results).toHaveFocus()
    fireEvent.click(screen.getByRole("switch", { name: "Landing page strip" }))
    expect(post).toHaveBeenCalledTimes(1)
    finish(new Response(JSON.stringify({ ok: true })))
    await waitFor(() => expect(results).not.toHaveAttribute("aria-disabled"))
    expect(results).toHaveFocus()
  })
})
