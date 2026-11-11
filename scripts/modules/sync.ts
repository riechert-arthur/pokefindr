/**
 * npm run modules:sync (#324): writes what's generated from the module
 * manifests into files that can't import code. Today that's vercel.json's
 * `crons` (src/server/lib/jobs/crons.ts). Run it after changing a job's
 * schedule; a test fails until you do.
 */
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { MODULES } from "@/modules/registry"
import { cronsFor } from "@/server/lib/jobs/crons"

const file = path.resolve(__dirname, "../../vercel.json")
const crons = cronsFor(MODULES)
const block = `"crons": [\n${crons.map((c) => `    { "path": ${JSON.stringify(c.path)}, "schedule": ${JSON.stringify(c.schedule)} }`).join(",\n")}\n  ]`
const before = readFileSync(file, "utf8")
const after = before.replace(/"crons": \[[\s\S]*?\n {2}\]/, block)
if (after === before && !before.includes(block)) throw new Error("vercel.json has no crons list to replace")
writeFileSync(file, after)
console.log(`vercel.json: ${crons.length} crons`)
