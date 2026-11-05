import { describe, expect, it } from "vitest"
import { canCopyBase } from "../../scripts/db/branchDatabase"

describe("canCopyBase", () => {
  it("copies when the branch has every migration applied to main's database", () => {
    expect(canCopyBase([], ["0000_baseline"])).toBe(true)
    expect(canCopyBase(["0000_baseline"], ["0000_baseline", "0001_branch_change"])).toBe(true)
  })

  it("doesn't copy when main's database has a migration the branch lacks", () => {
    expect(canCopyBase(["0000_baseline", "0001_newer_on_main"], ["0000_baseline", "0001_branch_change"])).toBe(false)
  })
})
