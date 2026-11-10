/**
 * Applies infra/vercel-firewall.json to the Vercel project (#197,
 * docs/scraping.md). Prints what would change; `--apply` sends it.
 *
 *   VERCEL_TOKEN=… npm run firewall            # show the difference
 *   VERCEL_TOKEN=… npm run firewall -- --apply # replace the live config
 *
 * The file is the whole configuration: rules, IP blocks and managed rulesets
 * changed in the dashboard are overwritten, so change them here instead.
 */
import { readFileSync } from "node:fs"
import path from "node:path"

const PROJECT_ID = process.env.VERCEL_PROJECT_ID ?? "prj_CTs8gclKQokoDXJ03s691c8udEuU"
const TEAM_ID = process.env.VERCEL_TEAM_ID ?? "team_GNxk3mJ8cWtvgtGJ8AkfOP3r"
const API = "https://api.vercel.com/v1/security/firewall/config"

type Rule = { name: string; [key: string]: unknown }
type Config = { rules?: Rule[]; ips?: unknown[]; crs?: Record<string, { active?: boolean }>; managedRules?: Record<string, unknown> }

/** A response's JSON, or its text in an error with the status when it isn't JSON. */
async function body(res: Response, what: string): Promise<unknown> {
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`${what}: ${res.status} ${text.slice(0, 200)}`)
  }
}

/** Compares the parts a rule is made of, ignoring ids and timestamps the API adds. */
const shape = (rule: Rule) => JSON.stringify({ ...rule, id: undefined, valid: undefined, validationErrors: undefined })

async function main() {
  const token = process.env.VERCEL_TOKEN
  if (!token) throw new Error("Set VERCEL_TOKEN (a token with access to the project's team).")
  const wanted = JSON.parse(readFileSync(path.join(__dirname, "../../infra/vercel-firewall.json"), "utf8")) as Config
  const query = `projectId=${PROJECT_ID}&teamId=${TEAM_ID}`
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }

  const res = await fetch(`${API}/active?${query}`, { headers })
  const got = await body(res, "GET firewall config")
  // A project without a firewall config yet answers 404 "Config not found"; any other 404 is a wrong id.
  const missing = res.status === 404 && /config not found/i.test(JSON.stringify(got))
  if (!res.ok && !missing) throw new Error(`GET firewall config: ${res.status} ${JSON.stringify(got)}`)
  const live: Config = missing ? {} : (got as { active?: Config }).active ?? (got as Config)

  const liveRules = new Map((live.rules ?? []).map((r) => [r.name, r]))
  const wantedNames = new Set((wanted.rules ?? []).map((r) => r.name))
  console.log(missing ? "The project has no firewall config yet.\n" : "")
  for (const rule of wanted.rules ?? []) {
    const before = liveRules.get(rule.name)
    console.log(`${!before ? "+ add   " : shape(before) === shape(rule) ? "  same  " : "~ change"} ${rule.name}`)
    if (before && shape(before) !== shape(rule)) console.log(`    live:   ${shape(before)}\n    wanted: ${shape(rule)}`)
  }
  for (const name of liveRules.keys()) if (!wantedNames.has(name)) console.log(`- remove ${name}`)
  console.log(`  Bot Protection: ${JSON.stringify(live.managedRules?.bot_protection ?? null)} → ${JSON.stringify(wanted.managedRules?.bot_protection ?? null)}`)
  // Set in the dashboard only, and wiped by --apply.
  if (live.ips?.length) console.log(`! ${live.ips.length} IP rule(s) live that the file doesn't have: --apply removes them.`)
  const crs = Object.entries(live.crs ?? {}).filter(([, v]) => v.active).map(([k]) => k)
  if (crs.length) console.log(`! Managed rules on in the dashboard (${crs.join(", ")}) that the file doesn't have: --apply turns them off.`)

  if (!process.argv.includes("--apply")) return console.log("\nDry run. Add --apply to replace the live configuration.")
  const put = await fetch(`${API}?${query}`, { method: "PUT", headers, body: JSON.stringify(wanted) })
  const result = await body(put, "PUT firewall config")
  if (!put.ok) throw new Error(`PUT firewall config: ${put.status} ${JSON.stringify(result)}`)
  console.log("Applied.")
}

main().catch((err) => {
  console.error(`[firewall] ${err instanceof Error ? err.message : err}`)
  process.exit(1)
})
