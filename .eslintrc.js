/**
 * ESLint config. A no-restricted-syntax override replaces the option list
 * instead of merging it, so the shared selectors are built once here and
 * listed in each block that needs them.
 */

const ENV_RULES = [
  {
    selector:
      "MemberExpression[object.type='MemberExpression'][object.object.name='process'][object.property.name='env'][property.name!='NODE_ENV'][property.name!='NEXT_RUNTIME'][property.name!='NEXT_PHASE']",
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
// CSS functions whose arguments can hold a color.
const CSS_FNS = String.raw`(?:(?:repeating-)?(?:linear|radial|conic)-gradient|var|drop-shadow|color-mix)`

// Every pattern is case-insensitive, like CSS.
const COLOR_PATTERNS = [
  {
    // text-blue-600, hover:!bg-gray-50, border-t-red-500 ...
    re: String.raw`(^|[\s:'"\x60!])(bg|text|border(-[trblxyse])?|ring|ring-offset|outline|from|via|to|fill|stroke|decoration|divide|placeholder|accent|caret|shadow)-(${PALETTE})-\d{2,3}\b`,
    message: "Use a design token (e.g. text-primary, bg-muted, text-kind-shop) instead of a Tailwind palette color. Tokens are defined in src/app/globals.css.",
  },
  {
    // Arbitrary values and properties: bg-[#fff], text-[rgb(0,0,0)], bg-[oklch(...)],
    // text-[color:red], [color:red], text-[theme(colors.blue.500)]; hsl(var(--token)) is fine.
    re: String.raw`(^|[\s'"\x60:!-])\[([a-z-]+:)?(#|(${COLOR_FN})\((?!\s*var\()|(${NAMED})\]|theme\(\s*['"]?colors\.)`,
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
    // A hex color inside a CSS function (linear-gradient(135deg, #c026d3, ...), var(--x,#fff))
    // or inside a Tailwind arbitrary value (shadow-[0_0_10px_#fff]). Prose like "(#142)" is fine.
    re: String.raw`(${CSS_FNS}\([^)]*|-\[[^\]\s]*[_,(])${HEX}(?![\w-])`,
    message: `Colors come from design tokens. ${TOKENS_HINT}`,
  },
  {
    // rgb(...), oklch(...), also inside arbitrary values like shadow-[0_0_4px_rgba(0,0,0,.5)].
    re: String.raw`${START}(${COLOR_FN})\((?!\s*var\()`,
    message: `Colors come from design tokens. ${TOKENS_HINT}`,
  },
]

// Values in places that take a color: a hex (alone or in a shorthand like
// "1px solid #ddd") or a CSS named color. Anchors and selectors elsewhere
// ("#add", router.push("#bed")) and prose ("Fixes: #142") aren't colors.
const HEX_VALUE = String.raw`(^|[\s(,])${HEX}(?![\w-])`
const NAMED_VALUE = String.raw`^(${NAMED})$`
const COLOR_NAME = "/(color|colour|background|fill|stroke|shadow|border|outline|^bg$|^fg$)/i"
const COLOR_PLACES = [
  // fill="#fff", stroke={"#fff"}, color={dark ? "#fff" : "#000"}
  "JSXAttribute[name.name=/^(fill|stroke|color|stopColor|floodColor|lightingColor|bgcolor)$/]",
  // style={{ color: ..., borderColor: ... }}, including ternaries and nested values
  `Property[key.name=${COLOR_NAME}]`,
  `Property[key.value=${COLOR_NAME}]`,
  // const KIND_COLORS = { shop: "#c026d3" }, const brandColor = ...
  `VariableDeclarator[id.name=${COLOR_NAME}]`,
]
const VALUE_RULES = COLOR_PLACES.flatMap((place) => [
  `${place} Literal[value=/${HEX_VALUE}/i]`,
  `${place} TemplateElement[value.raw=/${HEX_VALUE}/i]`,
  `${place} Literal[value=/${NAMED_VALUE}/i]`,
]).concat(
  // Any constant that is just a hex color: const PIN = "#c026d3".
  `VariableDeclarator > Literal[value=/^${HEX}$/]`,
)

const COLOR_RULES = [
  ...COLOR_PATTERNS.flatMap(({ re, message }) => [
    { selector: `Literal[value=/${re}/i]`, message },
    { selector: `TemplateElement[value.raw=/${re}/i]`, message },
  ]),
  ...VALUE_RULES.map((selector) => ({ selector, message: `Colors come from design tokens. ${TOKENS_HINT}` })),
]

/** Only src/components/map/engine.ts may import the map library (#46). */
const MAP_LIBRARY_RULE = [
  "error",
  {
    patterns: [
      {
        group: ["maplibre-gl", "maplibre-gl/*", "@vis.gl/react-maplibre", "react-map-gl", "react-map-gl/*", "mapbox-gl", "mapbox-gl/*"],
        message: "Import map components and types from @/components/map/engine, the only module that imports the map library.",
      },
    ],
  },
]

module.exports = {
  extends: ["next/core-web-vitals", "next/typescript"],
  rules: {
    "no-restricted-syntax": ["error", ...ENV_RULES],
    "no-restricted-imports": MAP_LIBRARY_RULE,
  },
  overrides: [
    {
      files: ["src/components/map/engine.ts"],
      rules: { "no-restricted-imports": "off" },
    },
    {
      files: ["src/**/*.{js,jsx,ts,tsx}"],
      rules: { "no-restricted-syntax": ["error", ...ENV_RULES, ...COLOR_RULES] },
    },
    {
      // Illustrations, generated images and emails (which can't read CSS
      // variables) and the token runtime, which turns token channels into
      // color strings. Email colors are tested against the tokens.
      files: [
        "src/components/icons/**",
        "src/server/email/**",
        "src/app/**/{opengraph-image,twitter-image,icon,apple-icon}.{tsx,ts,jsx,js}",
        "src/lib/design/**",
      ],
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
        ".storybook/test-runner.ts",
        "scripts/**",
      ],
      rules: { "no-restricted-syntax": "off" },
    },
  ],
}
