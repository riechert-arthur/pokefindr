---
name: review-and-merge
description: Mark PokeFindr PRs ready, review them, fix what the review finds, and merge them, one at a time up a stack, without force pushes. Use when someone says "mark ready", "review and merge", "begin the review and merge cycle", "land the stack", or asks to merge one or more PRs in this repo.
---

# Review and merge

The goal is to land each PR with its review findings fixed and CI passing, keeping history that reviewers can follow. That's why this repo uses **merge commits only**: no squash, no rebase, no force push. A review reply is a new commit the reviewer can read on its own.

Work bottom-up: finish the lowest PR in the stack before starting the next.

## For each PR

1. **Mark it ready:** `gh pr ready <n>`.

2. **Review it.** Use the `code-review` skill on the PR with `--comment` (medium effort unless asked otherwise), so findings land as inline comments. Running it in a forked subagent keeps your context clear. Tell it to:
   - work in its own worktree, not yours;
   - use its own integration database (`TEST_DATABASE_URL=…/pokefindr_<something>_test`). Integration setup drops and recreates that database, so two runs sharing one break each other;
   - not push.

3. **Check each finding before fixing it.** Reproduce it or read the code path; reviewers can be wrong. When several findings share a cause, fix the cause. For example, three bugs that all came from doing something outside the migrator were fixed by moving it into the migrator.

4. **Fix and verify.** Run the checks in `verify-changes` for what you touched. Re-run the actual scenario, not only the unit tests.

5. **Commit and push.** Use a subject like `Answer the review of <the PR's topic> (#<issue>)` and push normally. Then post one PR comment that says how each finding was handled: fixed (and how), or not changed (and why). If the design changed, update the PR description to match.

6. **Wait for CI:** `gh pr checks <n> --watch`. All five jobs must pass. If one fails, read the log (`gh run view --log-failed`), fix it, and push again; don't merge on red.

7. **Merge:** `gh pr merge <n> --merge`. Check that the issue closed (`Closes #N` in the description does it).

8. **Move the stack up:**
   - Retarget the next PR to `main` (`gh pr edit <next> --base main`).
   - If a fix you made lower down is needed higher up, merge the lower branch into the higher one (`git merge origin/main` on the next branch) and push. Never rebase or force-push.
   - Resolve conflicts by hand, then re-run that PR's checks.

## When to stop and ask

- A finding needs a product decision, such as what users see, or making something public. Ask, and give a recommendation.
- A fix would need a secret, a production change or a destructive command. Describe it and leave it to the person.
- CI fails for a reason unrelated to the PR. Report it rather than working around it.

## Report

Lead with what merged (PR numbers, issues closed). Then list review fixes worth knowing about, and every manual step left for the person, such as applying the firewall, setting env vars or running a script against production.

Merging to `main` deploys: the `migrate` workflow applies new migrations to staging and then production. Say so when a PR has a migration.
