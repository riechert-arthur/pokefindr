import { merge, type Messages, type Tree } from "./messages"
import type { Locale } from "./routing"
import en from "./generated/en.json"
import es from "./generated/es.json"

/**
 * Every language's messages at once, with English under any a language is
 * missing, as `loadMessages` gives them: for Storybook and the tests, which
 * switch language without a request. The app loads one language at a time.
 */
export const MESSAGES: Record<Locale, Messages> = { en, es: merge(en, es as Tree) as Messages }
