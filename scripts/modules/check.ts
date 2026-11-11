/**
 * npm run modules:check -- <id> (#326): the fast, complete check for work on
 * one module, so an agent (or a person) knows before pushing. Lints the
 * module's files and routes, typechecks, runs the module's unit tests, then
 * the removal check without `next build` (CI's removal job runs the build).
 */
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"
import { MODULES } from "@/modules/registry"

const ROOT = path.resolve(__dirname, "../..")
const id = process.argv.slice(2).find((a) => !a.startsWith("--"))
const manifest = MODULES.find((m: { id: string }) => m.id === id) as { id: string; routes: readonly string[] } | undefined
if (!id || !manifest) {
  console.error(`Usage: npm run modules:check -- <id>\nModules: ${MODULES.map((m: { id: string }) => m.id).join(", ") || "(none registered yet)"}`)
  process.exit(2)
}

const lintTargets = [`src/modules/${id}`, ...manifest.routes.map((r) => `src/app/${r}`)].filter((p) => existsSync(path.join(ROOT, p)))
const testTargets = [`src/modules/${id}`, `__tests__/modules/${id}`].filter((p) => existsSync(path.join(ROOT, p)))
const steps: [string, string[]][] = [
  ["lint", ["npx", "eslint", ...lintTargets]],
  ["typecheck", ["npm", "run", "-s", "typecheck"]],
  ["unit tests", ["npx", "vitest", "run", "--passWithNoTests", ...testTargets]],
  ["removal check", ["npx", "tsx", "scripts/modules/without.ts", id, "--quick"]],
]
for (const [name, cmd] of steps) {
  console.log(`\n▶ ${name}`)
  const r = spawnSync(cmd[0], cmd.slice(1), { cwd: ROOT, stdio: "inherit" })
  if (r.status !== 0) {
    console.error(`\n✗ ${name} failed for "${id}".`)
    process.exit(1)
  }
}
console.log(`\n✓ "${id}": lint, typecheck, unit tests and removal check passed.`)
