import { createRequire } from "node:module"
import { getStoryContext, type TestRunnerConfig } from "@storybook/test-runner"
import type { AxeResults, ContextObject, ImpactValue, RunOptions, Spec } from "axe-core"
import type { Page } from "playwright"

const require = createRequire(import.meta.url)
const AXE_PATH = require.resolve("axe-core/axe.min.js")

/** Violations at these levels fail the run; minor and moderate ones are printed only. */
const FAILING: ImpactValue[] = ["serious", "critical"]

/** Page-level rules: a story renders one component, not a page, so these always fire. */
const PAGE_RULES = ["landmark-one-main", "page-has-heading-one", "region"]

/** What the a11y addon checks by default: the page minus Storybook's own UI. */
const DEFAULT_CONTEXT: ContextObject = {
  include: ["body"],
  exclude: [[".sb-wrapper"], ["#storybook-docs"], ["#storybook-highlights-root"]],
}

type A11yParameters = {
  disable?: boolean
  test?: "off" | "todo" | "error"
  context?: ContextObject | string
  config?: Spec
  options?: RunOptions
}

type Theme = "light" | "dark" | "holo-light" | "holo-dark"
/** Every story is checked in each language (#186). */
const LOCALES = ["en", "es"] as const
type Locale = (typeof LOCALES)[number]

/**
 * English in every theme, and each other language in light: colors don't
 * change with the language, so its other passes would repeat English's. The
 * Holo themes only change colors, radius and font, so their passes check
 * color contrast alone, which keeps the run's time down.
 */
const A11Y_PASSES: (readonly [Locale, Theme, "all" | "contrast"])[] = [
  ["en", "light", "all"],
  ["en", "dark", "all"],
  ["en", "holo-light", "contrast"],
  ["en", "holo-dark", "contrast"],
  ...LOCALES.filter((l) => l !== "en").map((l) => [l, "light", "all"] as const),
]

/**
 * Switches the theme and language the way the toolbar does (the `theme` and
 * `locale` globals in .storybook/preview.tsx), so next-themes, color-scheme,
 * theme-aware components like the Toaster and next-intl all follow, then
 * waits for the theme class and <html lang>.
 */
async function setGlobals(page: Page, theme: Theme, locale: Locale) {
  // Resolves once the story has re-rendered for the new globals (or right away
  // if they're already set and nothing re-renders).
  const outcome = await page.evaluate(
    ({ t, l }) =>
      new Promise<string>((resolve) => {
        const html = document.documentElement
        if (html.classList.contains(t) && html.lang === l) return resolve("rendered")
        const channel = (window as unknown as {
          __STORYBOOK_ADDONS_CHANNEL__: { emit: (e: string, p: unknown) => void; once: (e: string, cb: () => void) => void }
        }).__STORYBOOK_ADDONS_CHANNEL__
        // Settle on whichever comes first: the re-render, a render error, or a timeout.
        for (const event of ["storyRendered", "storyErrored", "storyThrewException"]) channel.once(event, () => resolve(event))
        setTimeout(() => resolve("timeout"), 5000)
        channel.emit("updateGlobals", { globals: { theme: t, locale: l } })
      }),
    { t: theme, l: locale },
  )
  if (outcome !== "rendered" && outcome !== "storyRendered") {
    throw new Error(`Switching the story to ${theme}, ${locale} failed (${outcome}); see the story's own error above.`)
  }
  await page.waitForFunction(({ t, l }) => document.documentElement.classList.contains(t) && document.documentElement.lang === l, { t: theme, l: locale })
}

/**
 * Runs axe on every story after it renders, in every theme, in each
 * language (longer Spanish labels can overflow or overlap).
 *
 * Waivers are per story, through the same parameters the a11y panel reads:
 *   parameters: { a11y: { config: { rules: [{ id: "color-contrast", enabled: false }] } } }
 * `a11y: { test: "off" }` (or the older `disable: true`) skips a story, and
 * `a11y.context` narrows what's checked. Always add a comment saying why.
 */
const config: TestRunnerConfig = {
  // The built-in prepare (load the iframe), plus a flag the preview reads before
  // anything renders, to turn off the a11y addon's own runs (.storybook/preview.tsx).
  async prepare({ page }) {
    await page.addInitScript(() => {
      ;(window as unknown as { __A11Y_TEST_RUNNER__: boolean }).__A11Y_TEST_RUNNER__ = true
    })
    const iframe = new URL("iframe.html", process.env.TARGET_URL).toString()
    await page.goto(iframe, { waitUntil: "load" }).catch((error: Error) => {
      if (error.message?.includes("ERR_CONNECTION_REFUSED")) {
        throw new Error(`Could not access the Storybook instance at ${process.env.TARGET_URL}. Is it running?\n\n${error.message}`)
      }
      throw error
    })
  },

  async postVisit(page, context) {
    // The story already failed to render or play: report that, not a11y on a half-rendered page.
    if (context.hasFailure) return

    const story = await getStoryContext(page, context)
    const a11y = (story.parameters?.a11y ?? {}) as A11yParameters
    if (a11y.disable || a11y.test === "off") return

    // Once per page (the runner reuses it across a file's stories), each with
    // its own check: axe, and no transitions or animations, so axe measures
    // final colors after a theme flip or an enter animation.
    if (!(await page.evaluate(() => "axe" in window))) await page.addScriptTag({ path: AXE_PATH })
    if (!(await page.evaluate(() => !!document.getElementById("a11y-no-motion")))) {
      const style = await page.addStyleTag({ content: "*, *::before, *::after { transition: none !important; animation: none !important; }" })
      await style.evaluate((el) => (el as Element).setAttribute("id", "a11y-no-motion"))
    }

    // Rules a story disables in `config` stay off even if `options.runOnly` names them (as the addon does).
    const disabled = (a11y.config?.rules ?? []).filter((r) => r.enabled === false).map((r) => r.id)
    const rules = Object.fromEntries([...PAGE_RULES, ...disabled].map((id) => [id, { enabled: false }]))

    const failures: string[] = []
    try {
      for (const [locale, theme, scope] of A11Y_PASSES) {
        await setGlobals(page, theme, locale)
        const options = scope === "contrast" ? { ...a11y.options, runOnly: { type: "rule" as const, values: ["color-contrast"] } } : a11y.options
        const args = { spec: a11y.config, options, rules, context: a11y.context ?? DEFAULT_CONTEXT }
        const results = (await page.evaluate(async (a: typeof args) => {
          // The addon's own runs are off under the runner (see prepare above), so it
          // never loads axe; this is the copy injected above.
          const axe = (window as unknown as { axe: typeof import("axe-core") }).axe
          axe.reset()
          if (a.spec) axe.configure(a.spec)
          const options: RunOptions = { resultTypes: ["violations"], ...a.options, rules: { ...a.options?.rules, ...a.rules } }
          return JSON.parse(JSON.stringify(await axe.run(a.context as ContextObject, options)))
        }, args as never)) as AxeResults

        for (const v of results.violations) {
          const line = `[${locale}, ${theme}] ${v.impact} ${v.id}: ${v.help}\n    ${v.nodes.map((n) => `${n.target.join(" ")} — ${n.any[0]?.message ?? n.failureSummary}`).join("\n    ")}`
          if (v.impact && FAILING.includes(v.impact)) failures.push(line)
          else console.warn(`${context.title} › ${context.name}\n  ${line}`)
        }
      }
    } finally {
      // The page is reused for the next story in the file: leave it on the
      // default theme and language. A failure here mustn't hide the error above.
      await setGlobals(page, "light", "en").catch((error) => console.warn(`Couldn't restore the light theme in English: ${error}`))
      // Stories with parameters.themeToggle store their theme (next-themes): clear
      // it so the next story on the page starts from the default, whatever ran before.
      await page.evaluate(() => localStorage.removeItem("storybook-theme")).catch(() => {})
    }

    if (failures.length) {
      throw new Error(`Accessibility violations in ${context.title} › ${context.name}:\n  ${failures.join("\n  ")}\n\nSee docs/design-system.md#accessibility for how to fix or waive one.`)
    }
  },
}

export default config
