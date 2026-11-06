import { createRequire } from "node:module"
import { getStoryContext, type TestRunnerConfig } from "@storybook/test-runner"
import type { AxeResults, ImpactValue, RunOptions, Spec } from "axe-core"

const require = createRequire(import.meta.url)
const AXE_PATH = require.resolve("axe-core/axe.min.js")

/** Violations at these levels fail the run; minor and moderate ones are printed only. */
const FAILING: ImpactValue[] = ["serious", "critical"]

/** Page-level rules: a story renders one component, not a page, so these always fire. */
const PAGE_RULES = ["landmark-one-main", "page-has-heading-one", "region"]

/**
 * Runs axe on every story after it renders, in light and dark.
 *
 * Waivers are per story, through the same parameters the a11y panel uses:
 *   parameters: { a11y: { config: { rules: [{ id: "color-contrast", enabled: false }] } } }
 * or `a11y: { disable: true }` to skip a story. Always add a comment saying why.
 */
const config: TestRunnerConfig = {
  async postVisit(page, context) {
    const story = await getStoryContext(page, context)
    const a11y = (story.parameters?.a11y ?? {}) as { disable?: boolean; config?: Spec; options?: RunOptions }
    if (a11y.disable) return

    if (!(await page.evaluate(() => "axe" in window))) await page.addScriptTag({ path: AXE_PATH })
    // The runner flips themes instantly; stop transitions so axe measures final colors.
    await page.addStyleTag({ content: "*, *::before, *::after { transition: none !important; animation: none !important; }" })

    const failures: string[] = []
    for (const theme of ["light", "dark"] as const) {
      await page.evaluate((t) => {
        document.documentElement.classList.remove("light", "dark")
        document.documentElement.classList.add(t)
      }, theme)
      const results = (await page.evaluate(
        async ({ spec, options, pageRules }) => {
          const axe = (window as unknown as { axe: typeof import("axe-core") }).axe
          axe.reset()
          if (spec) axe.configure(spec)
          // Check the whole document so portalled content (dialogs, popovers) is included.
          return axe.run(document, {
            resultTypes: ["violations"],
            ...options,
            rules: { ...Object.fromEntries(pageRules.map((id) => [id, { enabled: false }])), ...options?.rules },
          })
        },
        { spec: a11y.config, options: a11y.options, pageRules: PAGE_RULES },
      )) as AxeResults

      for (const v of results.violations) {
        const line = `[${theme}] ${v.impact} ${v.id}: ${v.help}\n    ${v.nodes.map((n) => `${n.target.join(" ")} — ${n.any[0]?.message ?? n.failureSummary}`).join("\n    ")}`
        if (v.impact && FAILING.includes(v.impact)) failures.push(line)
        else console.warn(`${context.title} › ${context.name}\n  ${line}`)
      }
    }

    if (failures.length) {
      throw new Error(`Accessibility violations in ${context.title} › ${context.name}:\n  ${failures.join("\n  ")}\n\nSee docs/design-system.md#accessibility for how to fix or waive one.`)
    }
  },
}

export default config
