import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, within } from "../../helpers/intl"
import { JobsTable } from "@/components/admin/JobsTable"
import { cronText, resultText, type JobRow } from "@/lib/admin/jobs"

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const ago = (h: number) => new Date(Date.now() - h * 3600_000).toISOString()
const ROWS: JobRow[] = [
  { name: "location-import", description: "Loads the official vending list", trigger: "Deploy step", runnable: false, paused: null, pausedHere: false, lastRun: { status: "succeeded", startedAt: ago(5), finishedAt: ago(5), result: { staged: 1457, inserted: 0 }, error: null, trigger: "deploy" } },
  { name: "location-sync", description: "Pulls vending updates", trigger: "Cron · daily 09:00 UTC", runnable: false, blocked: "Waiting on an approved data source (#85)", paused: "Waiting on an approved data source (#85)", pausedHere: false, lastRun: null },
  { name: "expire-events", description: "Hides events once they're over", trigger: "Cron · daily 06:05 UTC", runnable: true, paused: null, pausedHere: false, lastRun: { status: "failed", startedAt: ago(2), finishedAt: ago(2), result: null, error: "database went away", trigger: "cron" } },
]

describe("JobsTable", () => {
  it("shows each job's trigger, last run, result and status, and who can be run", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ jobs: ROWS }))))
    render(<JobsTable />)
    const imp = (await screen.findByText("location-import")).closest("tr")!
    expect(within(imp).getByText("1,457 staged · 0 inserted")).toBeInTheDocument()
    expect(within(imp).getByText("Succeeded")).toBeInTheDocument()
    expect(within(imp).getByRole("button", { name: "Run now" })).toBeDisabled()

    const sync = screen.getByText("location-sync").closest("tr")!
    expect(within(sync).getByText("Paused")).toBeInTheDocument()
    expect(within(sync).getByText("Waiting on an approved data source (#85)")).toBeInTheDocument()
    expect(within(sync).getByRole("button", { name: "Run now" })).toBeDisabled()
    expect(within(sync).queryByRole("button", { name: "Pause" })).toBeNull()

    const expire = screen.getByText("expire-events").closest("tr")!
    expect(within(expire).getByText("database went away")).toBeInTheDocument()
    expect(within(expire).getByText("Failed")).toBeInTheDocument()
    expect(within(expire).getByRole("button", { name: "Run now" })).toBeEnabled()
    expect(within(expire).getByRole("button", { name: "Pause" })).toBeInTheDocument()
  })
})

describe("job formatting", () => {
  it("reads a daily cron and a run's counts", () => {
    expect(cronText("5 6 * * *")).toBe("daily 06:05 UTC")
    expect(cronText("*/5 * * * *")).toBe("*/5 * * * *")
    expect(resultText({ keptOverrides: 2, file: "x.json" })).toBe("2 kept overrides")
    expect(resultText({ paused: "Checking" })).toBe("Skipped: Checking")
    expect(resultText(null)).toBe("")
  })
})
