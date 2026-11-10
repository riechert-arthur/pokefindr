import { checkBotId } from "botid/server"
import { apiError } from "@/server/api-error"
import { onVercel } from "@/server/edge-config"

/**
 * A 403 for a request BotID says came from a bot, verified ones (search
 * engines) included: they index pages, not the API. Null for a person.
 * Outside Vercel (local dev, tests, CI) there's nothing to check against,
 * so every request passes.
 */
export async function refuseBots(): Promise<Response | null> {
  const result = await checkBotId({ developmentOptions: { isDevelopment: !onVercel() } })
  if (!result.isBot) return null
  return apiError("botBlocked", "This data is only served to the PokeFindr app.", 403)
}
