/**
 * npm run modules:without -- <id> [--quick] (#326): proves a module can be
 * removed without side effects. Copies the repo to a temp folder, deletes
 * src/modules/<id>/, its route files under src/app (its manifest's
 * `routes`) and its lines in the registry (and plans.ts, once it exists),
 * then runs typecheck, lint, the unit tests and `next build` on the copy, plus
 * the integration tests when the module has tables and TEST_DATABASE_URL is
 * set. --quick skips the build (modules:check uses it).
 *
 * On failure it prints exactly which files still depended on the module.
 */
import { execFileSync, spawnSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { MODULES } from "@/modules/registry"
import { dependents, withoutModule } from "./removal"

const ROOT = path.resolve(__dirname, "../..")
const args = process.argv.slice(2)
const id = args.find((a) => !a.startsWith("--"))
const quick = args.includes("--quick")
const keep = args.includes("--keep")

const manifest = MODULES.find((m: { id: string }) => m.id === id) as { id: string; routes: readonly string[] } | undefined
if (!id || !manifest) {
  console.error(`Usage: npm run modules:without -- <id> [--quick]\nModules: ${MODULES.map((m: { id: string }) => m.id).join(", ") || "(none registered yet)"}`)
  process.exit(2)
}

// 1. A copy of the working tree (tracked and new files, not ignored ones), sharing node_modules.
const copy = mkdtempSync(path.join(process.env.TMPDIR || tmpdir(), `without-${id}-`))
const files = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], { cwd: ROOT, encoding: "utf8" }).split("\0").filter(Boolean)
for (const f of files) {
  const from = path.join(ROOT, f)
  if (!existsSync(from)) continue // deleted but not staged
  mkdirSync(path.dirname(path.join(copy, f)), { recursive: true })
  cpSync(from, path.join(copy, f))
}
symlinkSync(path.join(ROOT, "node_modules"), path.join(copy, "node_modules"))

// 2. Remove the module: its folder, its routes, its registry lines.
const removed: string[] = [`src/modules/${id}/`]
rmSync(path.join(copy, "src/modules", id), { recursive: true, force: true })
for (const r of manifest.routes) {
  rmSync(path.join(copy, "src/app", r), { recursive: true, force: true })
  removed.push(`src/app/${r}`)
}
for (const [file, required] of [["src/modules/registry.ts", true], ["src/modules/registry.server.ts", false], ["src/modules/plans.ts", false]] as const) {
  const p = path.join(copy, file)
  if (!existsSync(p)) continue
  const before = readFileSync(p, "utf8")
  const after = withoutModule(before, id, { required })
  if (after !== before) {
    writeFileSync(p, after)
    removed.push(`its lines in ${file}`)
  }
}
const hasTables = existsSync(path.join(ROOT, "src/modules", id, "db/schema.ts"))
console.log(`Removed from a copy in ${copy}:\n  ${removed.join("\n  ")}\n`)

// 3. The checks.
const checks: { name: string; cmd: string[]; env?: Record<string, string> }[] = [
  { name: "typecheck", cmd: ["npm", "run", "-s", "typecheck"] },
  { name: "lint", cmd: ["npx", "next", "lint"] },
  { name: "unit tests", cmd: ["npx", "vitest", "run"] },
  ...(quick ? [] : [{ name: "next build", cmd: ["npx", "next", "build"], env: { NEXT_TELEMETRY_DISABLED: "1" } }]),
  ...(hasTables && process.env.TEST_DATABASE_URL ? [{ name: "integration tests", cmd: ["npx", "vitest", "run", "--config", "vitest.integration.config.mts"] }] : []),
]
if (hasTables && !process.env.TEST_DATABASE_URL) console.log(`(${id} has tables: set TEST_DATABASE_URL to a *_test database to run the integration tests too.)\n`)

const failed: { name: string; output: string }[] = []
for (const c of checks) {
  process.stdout.write(`${c.name}… `)
  const r = spawnSync(c.cmd[0], c.cmd.slice(1), { cwd: copy, encoding: "utf8", env: { ...process.env, ...c.env }, maxBuffer: 256 * 1024 * 1024 })
  const output = `${r.stdout ?? ""}\n${r.stderr ?? ""}`
  if (r.status === 0) console.log("ok")
  else {
    console.log("FAILED")
    failed.push({ name: c.name, output })
  }
}

if (!keep) rmSync(copy, { recursive: true, force: true })
if (failed.length === 0) {
  console.log(`\n✓ "${id}" can be removed without side effects.`)
  process.exit(0)
}
console.error(`\n✗ Removing "${id}" breaks: ${failed.map((f) => f.name).join(", ")}.\n`)
const files2 = [...new Set(failed.flatMap((f) => dependents(f.output)))]
if (files2.length) console.error(`These files still depend on "${id}" (import it through a slot or the registry instead, docs/architecture.md):\n  ${files2.join("\n  ")}\n`)
for (const f of failed) console.error(`--- ${f.name} ---\n${f.output.split("\n").filter((l) => l.trim()).slice(-60).join("\n")}\n`)
process.exit(1)
