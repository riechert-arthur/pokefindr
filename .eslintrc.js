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

// CSS properties that take a color, for hex values in style strings and template CSS.
const COLOR_PROPS = String.raw`(color|background(-color)?|fill|stroke|border(-[a-z]+)*-color|border|outline(-color)?|box-shadow|text-shadow|caret-color|accent-color|--[\w-]+)`
// Not after a word character or "-", but "_" (a Tailwind arbitrary-value space) is fine.
const START = String.raw`(?:^|[^a-zA-Z0-9-])`

const COLOR_PATTERNS = [
  {
    // text-blue-600, hover:!bg-gray-50, border-t-red-500 ...
    re: String.raw`(^|[\s:'"\x60!])(bg|text|border(-[trblxyse])?|ring|ring-offset|outline|from|via|to|fill|stroke|decoration|divide|placeholder|accent|caret|shadow)-(${PALETTE})-\d{2,3}\b`,
    message: "Use a design token (e.g. text-primary, bg-muted, text-kind-shop) instead of a Tailwind palette color. Tokens are defined in src/app/globals.css.",
  },
  {
    // bg-[#fff], text-[rgb(0,0,0)], bg-[oklch(...)], text-[color:red], text-[theme(colors.blue.500)];
    // hsl(var(--token)) is fine.
    re: String.raw`-\[(color:)?(#|(${COLOR_FN})\((?!\s*var\()|(${NAMED})\]|theme\(\s*['"]?colors\.)`,
    message: "Don't use arbitrary color values; add or use a design token in src/app/globals.css.",
  },
  {
    // A hex color in a color property: "color: #fff", "--ring: #3b82f6", "border: 1px solid #ddd".
    re: String.raw`${COLOR_PROPS}\s*:\s*[^;{}]*${HEX}(?![\w-])`,
    message: `Colors come from design tokens. ${TOKENS_HINT}`,
  },
  {
    // A hex color as an SVG/HTML color attribute in template markup: fill="#fff".
    re: String.raw`\b(fill|stroke|color|stop-color|flood-color|lighting-color|bgcolor)=["']${HEX}["']`,
    message: `Colors come from design tokens. ${TOKENS_HINT}`,
  },
  {
    // A hex color inside a function or arbitrary-value list: linear-gradient(135deg, #c026d3, ...),
    // shadow-[0_0_10px_#fff], var(--x,#fff). url(#id) fragment references are fine.
    re: String.raw`(?<!url)[(,_]\s*${HEX}(?![\w-])`,
    message: `Colors come from design tokens. ${TOKENS_HINT}`,
  },
  {
    // rgb(...), oklch(...), also inside arbitrary values like shadow-[0_0_4px_rgba(0,0,0,.5)].
    re: String.raw`${START}(${COLOR_FN})\((?!\s*var\()`,
    message: `Colors come from design tokens. ${TOKENS_HINT}`,
  },
]

// A hex value (alone or in a shorthand like "1px solid #ddd") in a place that
// takes a color. Anchors and selectors elsewhere ("#add", router.push("#bed"))
// and prose ("Fixes: #142") aren't colors.
const WHOLE_HEX = `Literal[value=/(^|[\\s(,])${HEX}(?![\\w-])/]`
const COLOR_NAME = "/(color|colour|background|fill|stroke|shadow|border|outline|^bg$|^fg$)/i"
const WHOLE_HEX_RULES = [
  `JSXAttribute[name.name=/^(fill|stroke|color|stopColor|floodColor|lightingColor|bgcolor)$/] ${WHOLE_HEX}`,
  `Property[key.name=${COLOR_NAME}] > ${WHOLE_HEX}`,
  `Property[key.value=${COLOR_NAME}] > ${WHOLE_HEX}`,
  `VariableDeclarator[id.name=${COLOR_NAME}] > ${WHOLE_HEX}`,
].map((selector) => ({ selector, message: `Colors come from design tokens. ${TOKENS_HINT}` }))

const COLOR_RULES = [
  ...COLOR_PATTERNS.flatMap(({ re, message }) => [
    { selector: `Literal[value=/${re}/]`, message },
    { selector: `TemplateElement[value.raw=/${re}/]`, message },
  ]),
  ...WHOLE_HEX_RULES,
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
      files: ["src/components/icons/**", "src/app/**/{opengraph-image,twitter-image,icon,apple-icon}.tsx"],
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
