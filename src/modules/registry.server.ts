import "server-only"
/**
 * The server-side half of the registry (#324): each module's
 * `module.server.ts` (assistant and MCP tools, job code, sitemap entries), in
 * the same order as src/modules/registry.ts. Server-only, so the browser
 * bundle never reaches it. A module without server contributions isn't listed.
 */
import { serverModuleProblems, type ServerModule } from "@/core/shell/server-slots"
import { MODULES } from "./registry"

export const SERVER_MODULES = [] as const satisfies readonly ServerModule[]

const problems = serverModuleProblems(MODULES, SERVER_MODULES)
if (problems.length) throw new Error(`The module registry is broken:\n- ${problems.join("\n- ")}`)
