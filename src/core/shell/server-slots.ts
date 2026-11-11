import "server-only"
/**
 * Server-side slots (#324): what modules add to lists core builds on the
 * server. A module declares these in its `module.server.ts`, listed in
 * src/modules/registry.server.ts; that file is server-only, so the browser
 * bundle never reaches job, tool or database code through a manifest.
 *
 * Gated contributions name an entitlement, checked with the caller's
 * platform role (`can()`), like `<Slot>` does for UI.
 */
import { can, type Entitlement } from "@/core/access/entitlements"
import type { Role } from "@/lib/auth/roles"
import type { AssistantTool } from "@/server/assistant/tools"
import type { AccountTool } from "@/server/mcp/account-tools"
import type { Job } from "@/server/lib/jobs/types"

/** A sitemap entry: an indexable page, by path. Never a location's page or the API (docs/scraping.md). */
export interface SitemapEntry {
  readonly path: string
  /** yyyy-mm-dd */
  readonly lastModified?: string
  /** English in every language, so listed once (as blog posts are). */
  readonly englishOnly?: boolean
}

export interface Gated<T> {
  readonly entitlement?: string
  readonly items: readonly T[]
}

/** What a module's `module.server.ts` exports. */
export interface ServerModule {
  /** The id of its manifest in src/modules/registry.ts. */
  readonly id: string
  readonly contributes: {
    /** Tools the assistant (and the MCP server's read tools) can call. */
    readonly "assistant.tools"?: readonly Gated<AssistantTool>[]
    /** Account tools on the MCP server (signed-in clients). */
    readonly "mcp.tools"?: readonly Gated<AccountTool>[]
    /** The code of the jobs the manifest declares, by the same names. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each job keeps its own payload type
    readonly jobs?: Readonly<Record<string, Job<any>>>
    readonly sitemap?: () => Promise<readonly SitemapEntry[]>
  }
}

/** Declares a module's server-side contributions. */
export const defineServerModule = <const M extends ServerModule>(m: M): M => m

const allowed = (role: Role | null, entitlement: string | undefined) => {
  if (!entitlement) return true
  try {
    return can(role, entitlement as Entitlement)
  } catch {
    return false
  }
}
const gated = <T>(lists: readonly (readonly Gated<T>[] | undefined)[], role: Role | null): T[] => lists.flatMap((l) => (l ?? []).filter((g) => allowed(role, g.entitlement)).flatMap((g) => g.items))

/** Modules' assistant tools the caller may use (core's own come first, in src/server/assistant/tools.ts). */
export const moduleAssistantTools = (modules: readonly ServerModule[], role: Role | null): AssistantTool[] => gated(modules.map((m) => m.contributes["assistant.tools"]), role)

/** Modules' MCP account tools the caller may use. */
export const moduleMcpTools = (modules: readonly ServerModule[], role: Role | null): AccountTool[] => gated(modules.map((m) => m.contributes["mcp.tools"]), role)

/** Modules' jobs, by name. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each job keeps its own payload type
export const moduleJobs = (modules: readonly ServerModule[]): Record<string, Job<any>> => Object.assign({}, ...modules.map((m) => m.contributes.jobs ?? {}))

/** Modules' sitemap entries. */
export async function moduleSitemapEntries(modules: readonly ServerModule[]): Promise<SitemapEntry[]> {
  return (await Promise.all(modules.map((m) => m.contributes.sitemap?.() ?? []))).flat()
}

/**
 * Everything wrong between the manifests and the server modules: a server
 * module without a manifest, or jobs that don't match what the manifest
 * declares (the crons in vercel.json come from the manifest).
 */
export function serverModuleProblems(manifests: readonly { id: string; contributes: { jobs?: Readonly<Record<string, unknown>> } }[], servers: readonly ServerModule[]): string[] {
  const problems: string[] = []
  const byId = new Map(manifests.map((m) => [m.id, m]))
  for (const s of servers) {
    const m = byId.get(s.id)
    if (!m) {
      problems.push(`src/modules/registry.server.ts lists "${s.id}", which isn't in src/modules/registry.ts.`)
      continue
    }
    const declared = Object.keys(m.contributes.jobs ?? {}).sort()
    const coded = Object.keys(s.contributes.jobs ?? {}).sort()
    for (const j of declared) if (!coded.includes(j)) problems.push(`Module "${s.id}" declares job "${j}" in module.ts but module.server.ts has no code for it.`)
    for (const j of coded) if (!declared.includes(j)) problems.push(`Module "${s.id}" has code for job "${j}" in module.server.ts but doesn't declare it in module.ts.`)
  }
  return problems
}
