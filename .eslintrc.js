/**
 * ESLint config. A no-restricted-syntax override replaces the option list
 * instead of merging it, so the shared selectors are built once here and
 * listed in each block that needs them.
 */

const ENV_RULES = [
  {
    selector:
      "MemberExpression[object.type='MemberExpression'][object.object.name='process'][object.property.name='env'][property.name!='NODE_ENV'][property.name!='NEXT_RUNTIME']",
    message: "Read configuration through getServerConfig() (src/server/config.ts) or publicConfig (src/config.public.ts).",
  },
  {
    selector:
      "VariableDeclarator[id.type='ObjectPattern'][init.type='MemberExpression'][init.object.name='process'][init.property.name='env']",
    message:
      "Don't destructure process.env. Read configuration through getServerConfig() (src/server/config.ts) or publicConfig (src/config.public.ts).",
  },
]

// Color patterns. Each is matched against string literals and template
// literal text. esquery regexes can't contain "/", so it's written \x2F.
const PALETTE =
  "red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone"
const NAMED =
  "aqua|beige|black|blue|brown|crimson|cyan|fuchsia|gold|gray|green|grey|indigo|ivory|lime|magenta|maroon|navy|olive|orange|pink|purple|red|salmon|silver|teal|tomato|turquoise|violet|white|yellow"
const HEX = "#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})"
const COLOR_FN = "rgba?|hsla?|oklch|oklab|lab|lch|hwb|color-mix"
const TOKENS_HINT = "Use a Tailwind token class, or readTokens() for runtime values (src/lib/design/tokens.ts)."

const COLOR_PATTERNS = [
  {
    // text-blue-600, hover:!bg-gray-50, border-t-red-500 ...
    re: String.raw`(^|[\s:'"\x60!])(bg|text|border(-[trblxyse])?|ring|ring-offset|outline|from|via|to|fill|stroke|decoration|divide|placeholder|accent|caret|shadow)-(${PALETTE})-\d{2,3}\b`,
    message: "Use a design token (e.g. text-primary, bg-muted, text-kind-shop) instead of a Tailwind palette color. Tokens are defined in src/app/globals.css.",
  },
  {
    // bg-[#fff], text-[rgb(0,0,0)], bg-[oklch(...)], text-[color:red]; hsl(var(--token)) is fine.
    re: String.raw`-\[(color:)?(#|(${COLOR_FN})\((?!\s*var\()|(${NAMED})\])`,
    message: "Don't use arbitrary color values; add or use a design token in src/app/globals.css.",
  },
  {
    // A hex color after a CSS colon or as an attribute value in template CSS/SVG.
    re: String.raw`(:\s*|=["'])${HEX}(?![\w-])`,
    message: `Colors come from design tokens. ${TOKENS_HINT}`,
  },
  {
    re: String.raw`\b(${COLOR_FN})\((?!\s*var\()`,
    message: `Colors come from design tokens. ${TOKENS_HINT}`,
  },
]

const COLOR_RULES = [
  ...COLOR_PATTERNS.flatMap(({ re, message }) => [
    { selector: `Literal[value=/${re}/]`, message },
    { selector: `TemplateElement[value.raw=/${re}/]`, message },
  ]),
  {
    // A whole string that is a hex color ("#fff" in a style or fill), except
    // href="#..." anchors. Text like "Fixed in #142" isn't a whole hex string.
    selector: `Literal[value=/^${HEX}$/]:not(JSXAttribute[name.name='href'] > Literal)`,
    message: `Colors come from design tokens. ${TOKENS_HINT}`,
  },
]

module.exports = {
  extends: ["next/core-web-vitals", "next/typescript"],
  rules: {
    "no-restricted-syntax": ["error", ...ENV_RULES],
  },
  overrides: [
    {
      files: ["src/components/**/*.{ts,tsx}", "src/app/**/*.{ts,tsx}"],
      rules: { "no-restricted-syntax": ["error", ...ENV_RULES, ...COLOR_RULES] },
    },
    {
      // Illustrations and generated images (which can't read CSS variables).
      files: ["src/components/icons/**", "src/app/opengraph-image.tsx", "src/app/apple-icon.tsx"],
      rules: { "no-restricted-syntax": ["error", ...ENV_RULES] },
    },
    {
      files: [
        "src/server/config.ts",
        "src/server/edge-config.ts",
        "src/server/site-url.ts",
        "src/config.public.ts",
        "__tests__/**",
        "*.config.*",
        ".eslintrc.js",
        "scripts/**",
      ],
      rules: { "no-restricted-syntax": "off" },
    },
  ],
}
