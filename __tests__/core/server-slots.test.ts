// @vitest-environment node
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { defineServerModule, moduleAssistantTools, moduleJobs, moduleMcpTools, moduleSitemapEntries, serverModuleProblems } from "@/core/shell/server-slots"
import { defineModule } from "@/core/shell/module"
import { cronsFor, CORE_CRONS } from "@/server/lib/jobs/crons"
import { jobs } from "@/server/lib/jobs/registry"
import { MODULES } from "@/modules/registry"
import { SERVER_MODULES } from "@/modules/registry.server"
import type { AssistantTool } from "@/server/assistant/tools"
import type { Job } from "@/server/lib/jobs/types"

const tool = (name: string) => ({ name }) as unknown as AssistantTool
const job = { description: "test", run: async () => ({}) } as Job
const manifest = defineModule({ id: "events", name: "Events", contributes: { jobs: { "expire-events-2": { schedule: "5 7 * * *" }, "notify-2": {} } } })
const server = defineServerModule({
  id: "events",
  contributes: {
    "assistant.tools": [{ items: [tool("list_events_2")] }, { entitlement: "admin.jobs", items: [tool("staff_only")] }],
    "mcp.tools": [{ entitlement: "admin.jobs", items: [tool("staff_mcp") as never] }],
    jobs: { "expire-events-2": job, "notify-2": job },
    sitemap: async () => [{ path: "/events", lastModified: "2026-01-02" }],
  },
})

describe("server-side slots (#324)", () => {
  it("offer tools by the caller's role", () => {
    expect(moduleAssistantTools([server], null).map((t) => t.name)).toEqual(["list_events_2"])
    expect(moduleAssistantTools([server], "admin").map((t) => t.name)).toEqual(["list_events_2", "staff_only"])
    expect(moduleMcpTools([server], "member")).toEqual([])
  })

  it("collect jobs and sitemap entries", async () => {
    expect(Object.keys(moduleJobs([server]))).toEqual(["expire-events-2", "notify-2"])
    expect(await moduleSitemapEntries([server])).toEqual([{ path: "/events", lastModified: "2026-01-02" }])
  })

  it("check the server half against the manifests", () => {
    expect(serverModuleProblems([manifest], [server])).toEqual([])
    expect(serverModuleProblems([], [server])).toEqual([`src/modules/registry.server.ts lists "events", which isn't in src/modules/registry.ts.`])
    const missing = defineServerModule({ id: "events", contributes: { jobs: { "notify-2": job, extra: job } } })
    expect(serverModuleProblems([manifest], [missing])).toEqual([
      `Module "events" declares job "expire-events-2" in module.ts but module.server.ts has no code for it.`,
      `Module "events" has code for job "extra" in module.server.ts but doesn't declare it in module.ts.`,
    ])
  })

  it("are consistent as registered", () => {
    expect(serverModuleProblems(MODULES, SERVER_MODULES)).toEqual([])
  })
})

describe("crons (#324)", () => {
  it("add each module's scheduled jobs after core's", () => {
    expect(cronsFor([manifest]).slice(-1)).toEqual([{ path: "/api/jobs/expire-events-2", schedule: "5 7 * * *" }])
    expect(cronsFor([manifest])).toHaveLength(CORE_CRONS.length + 1)
  })

  it("are what vercel.json has (run npm run modules:sync after changing a schedule)", () => {
    const vercel = JSON.parse(readFileSync(path.resolve(__dirname, "../../vercel.json"), "utf8"))
    expect(vercel.crons).toEqual(cronsFor(MODULES))
  })

  it("each run a job that exists", () => {
    for (const c of cronsFor(MODULES)) expect(Object.keys(jobs)).toContain(c.path.replace("/api/jobs/", ""))
  })
})
