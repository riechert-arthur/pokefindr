import { checkBotId } from "botid/server"
import { apiError } from "@/server/api-error"
import { onVercelProduction } from "@/server/edge-config"
import { log } from "@/server/log"

/**
 * A 403 for a request BotID says came from a bot, verified ones (search
 * engines) included: they index pages, not the API. Null for a person.
 *
 * Only a production deployment on Vercel checks for real: local dev (even
 * with `vercel env pull`'s VERCEL=1), tests and CI let every request through.
 * If BotID itself fails, the request goes through and the error is logged,
 * so a BotID outage can't take the map down; the rate limits still apply.
 */
export async function refuseBots(route?: string): Promise<Response | null> {
  try {
    const result = await checkBotId({ developmentOptions: { isDevelopment: !onVercelProduction() } })
    if (!result.isBot) return null
  } catch (err) {
    log.logError("botid.check_failed", err, { route })
    return null
  }
  // The route only: nothing about who asked.
  log.info("security.bot_blocked", { route })
  return apiError("botBlocked", "This data is only served to the PokeFindr app.", 403)
}
