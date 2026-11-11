/**
 * npm run lint:boundaries (#325): every architecture boundary violation in
 * src/, counted by rule and by file, then listed. Exits 0 while the rules are
 * warnings; after #338 `npm run lint` fails on them anyway.
 */
import { ESLint } from "eslint"

const eslint = new ESLint()
const results = await eslint.lintFiles(["src/**/*.{ts,tsx}"])
const found = results.flatMap((r) =>
  r.messages.filter((m) => m.ruleId?.startsWith("boundaries/")).map((m) => ({ file: r.filePath.replace(`${process.cwd()}/`, ""), line: m.line, rule: m.ruleId, message: m.message })),
)
const count = (key) => {
  const n = new Map()
  for (const f of found) n.set(f[key], (n.get(f[key]) ?? 0) + 1)
  return [...n].sort((a, b) => b[1] - a[1])
}

console.log(`${found.length} boundary violation${found.length === 1 ? "" : "s"} in src/`)
if (found.length) {
  console.log("\nBy rule:")
  for (const [rule, n] of count("rule")) console.log(`  ${String(n).padStart(4)}  ${rule}`)
  console.log("\nBy file:")
  for (const [file, n] of count("file")) console.log(`  ${String(n).padStart(4)}  ${file}`)
  console.log("\nEach one:")
  for (const f of found) console.log(`  ${f.file}:${f.line}  ${f.message}`)
}
