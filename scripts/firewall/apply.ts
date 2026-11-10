/**
 * Applies infra/vercel-firewall.json to the Vercel project (#197,
 * docs/scraping.md). Prints what would change; `--apply` sends it.
 *
 *   VERCEL_TOKEN=… npm run firewall            # show the difference
 *   VERCEL_TOKEN=… npm run firewall -- --apply # replace the live config
 *
 * The file is the whole configuration: rules changed in the dashboard are
 * overwritten, so change them here instead.
 */
import { readFileSync } from "node:fs"
import path from "node:path"

const PROJECT_ID = process.env.VERCEL_PROJECT_ID ?? "prj_CTs8gclKQokoDXJ03s691c8udEuU"
const TEAM_ID = process.env.VERCEL_TEAM_ID ?? "team_GNxk3mJ8cWtvgtGJ8AkfOP3r"
const API = "https://api.vercel.com/v1/security/firewall/config"

async function main() {
  const token = process.env.VERCEL_TOKEN
  if (!token) throw new Error("Set VERCEL_TOKEN (a token with access to the project's team).")
  const wanted = JSON.parse(readFileSync(path.join(__dirname, "../../infra/vercel-firewall.json"), "utf8"))
  const query = `projectId=${PROJECT_ID}&teamId=${TEAM_ID}`
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }

  const res = await fetch(`${API}/active?${query}`, { headers })
  const live = res.status === 404 ? null : await res.json()
  if (res.status !== 404 && !res.ok) throw new Error(`GET firewall config: ${res.status} ${JSON.stringify(live)}`)
  console.log("Live rules:  ", live ? (live.rules ?? []).map((r: { name: string }) => r.name).join(" · ") || "none" : "no firewall config yet")
  console.log("Wanted rules:", wanted.rules.map((r: { name: string }) => r.name).join(" · "))
  console.log("Bot Protection:", JSON.stringify(live?.managedRules?.bot_protection ?? null), "→", JSON.stringify(wanted.managedRules.bot_protection))

  if (!process.argv.includes("--apply")) return console.log("\nDry run. Add --apply to replace the live configuration.")
  const put = await fetch(`${API}?${query}`, { method: "PUT", headers, body: JSON.stringify(wanted) })
  const body = await put.json()
  if (!put.ok) throw new Error(`PUT firewall config: ${put.status} ${JSON.stringify(body)}`)
  console.log(`Applied. Version ${body.active?.version ?? body.version ?? "?"}.`)
}

main().catch((err) => {
  console.error(`[firewall] ${err instanceof Error ? err.message : err}`)
  process.exit(1)
})
