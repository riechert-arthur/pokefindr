---
name: milestone-prs
description: Turn a PokeFindr milestone (R1, R2, … "R10 Scraping protection") or a set of issues into a stack of draft PRs, one per issue, with this repo's branch names, commit style and PR description format. Use whenever someone asks to "draft PRs for R<N>", start a milestone, implement a batch of issues, or open a PR for an issue in this repo, even if they don't say "stack".
---

# Drafting PRs for a milestone

Each milestone is a set of GitHub issues worked as a **stack**: one branch and one draft PR per issue, each branch built on the one before, in the order the issues depend on each other. Reviewers read one small PR at a time, and later PRs can use earlier ones' code.

## 1. Read the milestone

```bash
gh issue list --milestone "R10 Scraping protection" --state open --json number,title,body
```

Each issue has **Why**, **Tasks** and **Done when**. "Done when" is the bar for the PR. Read related docs in `docs/` before designing. Each area has one (`database.md`, `auth.md`, `jobs.md`, `i18n.md`, `scraping.md`, `mcp.md`, `design-system.md`, `analytics.md`), and the PR should update it when behavior changes.

Order the issues so foundations come first (schema → API → UI). If issues are independent, keep the milestone's numeric order.

## 2. Branches

Name them `r<milestone>/<NN>-<slug>`, for example `r10/01-firewall-rules`, `r10/02-botid`. The first branches from `origin/main`; each later one branches from the previous branch.

Work in a git worktree rather than the person's own checkout, because they may be running the app from it. Never use bare `git stash`: the stash is shared across worktrees.

## 3. Commits

The subject is a plain sentence saying what changed for users or developers, with the issue number:

```
Draw the landing map from grid cells, not every machine (#200)
Answer the review of the query caps (#201)
```

Small fix commits can use `fix(scope): …` / `feat(scope): …`. Explain the why in the body when it isn't obvious. Add the attribution lines the session asks for.

## 4. Verify before pushing

Run the checks in the `verify-changes` skill for the files you touched. CI runs five jobs (lint/typecheck/build, unit, Storybook + accessibility, integration, `make run`). Don't push something you haven't run locally.

## 5. Open each PR as a draft

```bash
gh pr create --draft --base <previous branch, or main for the first> --head r10/02-botid \
  --title "Check BotID on the location data (#198)" --body-file -
```

Description format (match it, reviewers expect it):

```markdown
Part 2 of 6 of R10 Scraping protection. Closes #198.

## What
- **Short label:** what changed and why, in plain words.

## Done when
How the issue's "Done when" is met, and how you checked it (tests, screenshots, a curl).

## Things to know
- **Short label:** trade-offs, follow-ups, anything a reviewer or the deployer must do by hand.
```

Write for a reader who hasn't seen the code. Name the files that matter, put manual steps (env vars, firewall apply, scripts to run in production) under "Things to know", and never put secrets or production data in a description. The repo is public.

## 6. Report

List the PRs in stack order with links. Say what wasn't verified and any manual steps. Stop there: marking ready and merging is a separate request (`review-and-merge`).
