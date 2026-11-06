/**
 * The type scale from the redesign prototype, used as Tailwind's
 * theme.extend.fontSize and by cn() (src/lib/utils.ts) so tailwind-merge knows
 * these are font sizes. Use these instead of text-5xl/text-sm/etc. so
 * headings, body and captions stay consistent.
 */
export const FONT_SIZE = {
  display: ["clamp(2.25rem, 1.5rem + 4vw, 4rem)", { lineHeight: "1.02", letterSpacing: "-0.035em", fontWeight: "700" }],
  title: ["clamp(1.625rem, 1.25rem + 1.6vw, 2.25rem)", { lineHeight: "1.1", letterSpacing: "-0.03em", fontWeight: "700" }],
  heading: ["1.25rem", { lineHeight: "1.3", letterSpacing: "-0.02em", fontWeight: "600" }],
  subheading: ["0.9375rem", { lineHeight: "1.35", letterSpacing: "-0.01em", fontWeight: "600" }],
  "body-lg": ["1.0625rem", { lineHeight: "1.55" }],
  body: ["0.875rem", { lineHeight: "1.45" }],
  caption: ["0.75rem", { lineHeight: "1.4" }],
  overline: ["0.6875rem", { lineHeight: "1.2", letterSpacing: "0.08em", fontWeight: "600" }],
} satisfies Record<string, [string, Record<string, string>]>
