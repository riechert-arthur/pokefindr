/**
 * The architecture's dependency rules (docs/architecture.md, "Layers and
 * dependency rules"; #325), checked by eslint-plugin-boundaries and merged
 * into .eslintrc.js. They're warnings until the boundaries are locked (#338).
 *
 * Every message says what to do instead, so whoever hits one (a person or an
 * agent) can fix it without asking.
 */
const fs = require("node:fs")
const path = require("node:path")

/** Each module's `requires`, read from its manifest's text (manifests are TypeScript, so they can't be imported here). */
function moduleRequires() {
  const dir = path.join(__dirname, "src/modules")
  if (!fs.existsSync(dir)) return {}
  const out = {}
  for (const id of fs.readdirSync(dir)) {
    const manifest = path.join(dir, id, "module.ts")
    if (!fs.existsSync(manifest)) continue
    const list = /requires:\s*\[([^\]]*)\]/.exec(fs.readFileSync(manifest, "utf8"))?.[1] ?? ""
    out[id] = [...list.matchAll(/["']([a-z][a-z0-9-]*)["']/g)].map((m) => m[1])
  }
  return out
}

/** Files that make up each layer. The first matching pattern wins, so the narrow ones come first. */
const ELEMENTS = [
  { type: "app", pattern: "src/app/**", mode: "full" },
  // The registry is how core reaches modules, so it's its own element that core may import.
  { type: "registry", pattern: "src/modules/registry{,.server}.ts", mode: "full" },
  { type: "module", pattern: "src/modules/*/**", mode: "full", capture: ["id"] },
  // The list of jobs and their schedules is the product's (each module adds its own), so it's core;
  // the job runner around it (src/server/lib/jobs/*) is platform.
  { type: "core", pattern: ["src/core/**", "src/server/lib/jobs/registry.ts", "src/server/lib/jobs/crons.ts"], mode: "full" },
  // The design system.
  { type: "ui", pattern: ["src/components/ui/**", "src/components/pokefindr/**", "src/components/brand/**", "src/components/icons/**"], mode: "full" },
  // Infrastructure with no product logic.
  { type: "platform", pattern: ["src/server/ports/**", "src/server/adapters/**", "src/server/db/**", "src/server/lib/**", "src/i18n/**"], mode: "full" },
  // Everything else is today's core code that hasn't moved to src/core yet (components, lib,
  // server/services, …). The design system and platform may still import it: it also holds shared
  // utilities (lib/utils, lib/design), so "platform knows nothing about the product" can only be
  // checked once product code has moved out.
  { type: "legacy", pattern: "src/**", mode: "full" },
]

const NOT_A_MODULE = ["core", "ui", "platform", "legacy"]

function rules() {
  const requires = moduleRequires()
  return [
    {
      from: NOT_A_MODULE,
      disallow: ["module"],
      message:
        "Core can't import a module (src/modules/${target.id}), or the module can't be removed. Add a slot in src/core/shell/slots.ts and fill it from the module's manifest, or read it through src/modules/registry.ts.",
    },
    {
      from: ["core", "ui", "platform", "legacy", "module", "registry"],
      disallow: ["app"],
      message: "Nothing imports from src/app: routes are the top layer. Move what you need into core, or into the module that owns it.",
    },
    {
      from: ["ui", "platform"],
      disallow: ["core", "registry"],
      message: "The design system (src/components/ui and friends) and the platform (src/server/ports, adapters, db, lib, src/i18n) know nothing about the product. Pass what you need in as props or arguments instead of importing core.",
    },
    {
      from: ["module"],
      disallow: ["registry"],
      message: "A module doesn't read the registry. Ask core for what you need through a slot's props, or `requires` the module and import its index.ts.",
    },
    // A module imports another only if it lists it in `requires`.
    ...Object.entries(requires).map(([id, req]) => ({
      from: [["module", { id }]],
      disallow: [["module", { id: `!(${[id, ...req].join("|")})` }]],
      message: `Module "${id}" doesn't require "\${target.id}". Add "\${target.id}" to requires in src/modules/${id}/module.ts if it really needs it, or contribute to a slot so it works without it.`,
    })),
  ]
}

module.exports = {
  plugins: ["boundaries"],
  settings: {
    "boundaries/elements": ELEMENTS,
    "boundaries/include": ["src/**/*"],
    "import/resolver": { typescript: { alwaysTryTypes: true, project: "./tsconfig.json" } },
  },
  rules: {
    "boundaries/element-types": ["warn", { default: "allow", rules: rules() }],
    // From outside a module, only its public files: index.ts for other modules and routes, and the
    // manifest halves for the registry. (Files inside one module import each other freely.)
    "boundaries/entry-point": [
      "warn",
      {
        default: "allow",
        rules: [
          {
            target: ["module"],
            disallow: ["!(index.ts|index.tsx|module.ts|module.server.ts)"],
            message:
              "Import @/modules/${target.id} (its index.ts) instead of a file inside it (${target.internalPath}). If what you need isn't exported there, export it from src/modules/${target.id}/index.ts.",
          },
        ],
      },
    ],
  },
}
