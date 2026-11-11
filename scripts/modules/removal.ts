/**
 * The pure parts of the removal check (#326), kept apart from the script so
 * they can be tested: taking a module out of the registry files, and reading
 * which files still depended on it from the checks' output.
 */

/**
 * The registry's text without module `id`: its import line (from
 * `./<id>/module` or `./<id>/module.server`) and that import's name in the
 * list. Throws if the module isn't imported there, so a renamed registry
 * doesn't quietly skip the check.
 */
export function withoutModule(registry: string, id: string, { required = true } = {}): string {
  const lines = registry.split("\n")
  const imports = lines
    .map((line, i) => ({ i, m: new RegExp(`^import\\s+(\\w+)\\s+from\\s+["']\\./${id}/module(?:\\.server)?["']`).exec(line) }))
    .filter((x): x is { i: number; m: RegExpExecArray } => !!x.m)
  if (imports.length === 0) {
    if (required) throw new Error(`Module "${id}" isn't imported in the registry (expected \`import <name> from "./${id}/module"\`).`)
    return registry
  }
  const names = imports.map((x) => x.m[1])
  const drop = new Set(imports.map((x) => x.i))
  let text = lines.filter((_, i) => !drop.has(i)).join("\n")
  for (const name of names) {
    // `[a, name, b]`, `[name]`, or the name on its own line in a multi-line list.
    text = text.replace(new RegExp(`^\\s*${name},?\\s*\\n`, "m"), "").replace(new RegExp(`\\b${name}\\b\\s*,\\s*`), "").replace(new RegExp(`,\\s*\\b${name}\\b`), "").replace(new RegExp(`\\[\\s*${name}\\s*\\]`), "[]")
  }
  return text
}

/**
 * The files the failed checks point at (`src/…:line`), once each, in order:
 * what still depends on the removed module.
 */
export function dependents(output: string): string[] {
  const seen = new Set<string>()
  for (const m of output.matchAll(/((?:\.\/)?(?:src|__tests__)\/[\w./@()[\]-]+\.(?:tsx?|mjs|js))(?:[:(](\d+))?/g)) {
    const at = `${m[1].replace(/^\.\//, "")}${m[2] ? `:${m[2]}` : ""}`
    seen.add(at)
  }
  return [...seen]
}
