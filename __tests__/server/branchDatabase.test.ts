import { describe, expect, it } from "vitest"
import { canCopyBase, staleReasons } from "../../scripts/db/branchDatabase"

describe("canCopyBase", () => {
  it("copies when the branch has every migration applied to main's database", () => {
    expect(canCopyBase([], ["0000_baseline"])).toBe(true)
    expect(canCopyBase(["0000_baseline"], ["0000_baseline", "0001_branch_change"])).toBe(true)
  })

  it("doesn't copy when main's database has a migration the branch lacks", () => {
    expect(canCopyBase(["0000_baseline", "0001_newer_on_main"], ["0000_baseline", "0001_branch_change"])).toBe(false)
  })
})

describe("staleReasons", () => {
  const files = new Map([
    ["0000_baseline", "aaa"],
    ["0001_change", "bbb"],
  ])

  it("is empty when every applied migration still matches its file", () => {
    expect(
      staleReasons(
        new Map([
          ["0000_baseline", "aaa"],
          ["0001_change", "bbb"],
        ]),
        files
      )
    ).toEqual([])
  })

  it("ignores pending migrations and ones applied before hashes were kept", () => {
    expect(staleReasons(new Map([["0000_baseline", null]]), files)).toEqual([])
  })

  it("notices a migration that changed after it was applied", () => {
    expect(
      staleReasons(
        new Map([
          ["0000_baseline", "aaa"],
          ["0001_change", "old"],
        ]),
        files
      )
    ).toEqual(["0001_change changed after this database applied it"])
  })

  it("notices an applied migration the branch no longer has", () => {
    expect(staleReasons(new Map([["0001_renamed", null]]), files)).toEqual([
      "0001_renamed was applied but isn't on this branch any more",
    ])
  })
})
