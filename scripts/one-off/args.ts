/** Command-line helpers shared by the one-off import scripts. */

/** The value after `flag` (`--file data.json`), undefined without the flag; throws when the value is missing. */
export function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  if (i === -1) return undefined
  const value = process.argv[i + 1]
  if (!value || value.startsWith("--")) throw new Error(`${flag} needs a value`)
  return value
}
