import { initBotId } from "botid/client/core"
import { BOT_CHECKED_PATHS } from "@/lib/bot-checked-paths"

// BotID (#198, docs/scraping.md): proves the app's own requests for location
// data come from a browser, invisibly. The routes check it with refuseBots().
initBotId({ protect: BOT_CHECKED_PATHS.map((path) => ({ path, method: "GET" })) })
