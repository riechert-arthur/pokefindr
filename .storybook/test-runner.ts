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

/**
 * Switches the theme the way the toolbar does (the `theme` global in
 * .storybook/preview.tsx), so next-themes, color-scheme and theme-aware
 * components like the Toaster all follow, then waits for the class.
 */
async function setTheme(page: Page, theme: "light" | "dark") {
  // Resolves once the story has re-rendered for the new globals (or right away
  // if the theme is already set and nothing re-renders).
  await page.evaluate(
    (t) =>
      new Promise<void>((resolve) => {
        if (document.documentElement.classList.contains(t)) return resolve()
        const channel = (window as unknown as {
          __STORYBOOK_ADDONS_CHANNEL__: { emit: (e: string, p: unknown) => void; once: (e: string, cb: () => void) => void }
        }).__STORYBOOK_ADDONS_CHANNEL__
        channel.once("storyRendered", () => resolve())
        channel.emit("updateGlobals", { globals: { theme: t } })
      }),
    theme,
  )
  await page.waitForFunction((t) => document.documentElement.classList.contains(t), theme)
}

/**
 * Runs axe on every story after it renders, in light and dark.
 *
 * Waivers are per story, through the same parameters the a11y panel reads:
 *   parameters: { a11y: { config: { rules: [{ id: "color-contrast", enabled: false }] } } }
 * `a11y: { test: "off" }` (or the older `disable: true`) skips a story, and
 * `a11y.context` narrows what's checked. Always add a comment saying why.
 */
const config: TestRunnerConfig = {
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
      for (const theme of ["light", "dark"] as const) {
        await setTheme(page, theme)
        const args = { spec: a11y.config, options: a11y.options, rules, context: a11y.context ?? DEFAULT_CONTEXT }
        const results = (await page.evaluate(async (a: typeof args) => {
          // The addon's own runs are off under the runner (see .storybook/preview.tsx), so this axe is ours.
          const axe = (window as unknown as { axe: typeof import("axe-core") }).axe
          axe.reset()
          if (a.spec) axe.configure(a.spec)
          const options: RunOptions = { resultTypes: ["violations"], ...a.options, rules: { ...a.options?.rules, ...a.rules } }
          return JSON.parse(JSON.stringify(await axe.run(a.context as ContextObject, options)))
        }, args as never)) as AxeResults

        for (const v of results.violations) {
          const line = `[${theme}] ${v.impact} ${v.id}: ${v.help}\n    ${v.nodes.map((n) => `${n.target.join(" ")} — ${n.any[0]?.message ?? n.failureSummary}`).join("\n    ")}`
          if (v.impact && FAILING.includes(v.impact)) failures.push(line)
          else console.warn(`${context.title} › ${context.name}\n  ${line}`)
        }
      }
    } finally {
      // The page is reused for the next story in the file: leave it on the
      // default theme. A failure here mustn't hide the error above.
      await setTheme(page, "light").catch((error) => console.warn(`Couldn't restore the light theme: ${error}`))
    }

    if (failures.length) {
      throw new Error(`Accessibility violations in ${context.title} › ${context.name}:\n  ${failures.join("\n  ")}\n\nSee docs/design-system.md#accessibility for how to fix or waive one.`)
    }
  },
}

export default config
