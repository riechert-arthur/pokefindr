---
name: verify-changes
description: The checks to run on a PokeFindr change before pushing or merging - typecheck, lint, unit, integration (with a private _test database), e2e, Storybook and i18n catalogs - and how to run them without breaking someone else's run. Use before every push or PR in this repo, when asked to "test", "run CI locally", or "make sure it works", and when an integration or e2e test fails.
---

# Verifying a change

CI (`.github/workflows/tests.yml`) runs five jobs: **Lint, typecheck and build**, **Unit tests**, **Storybook build and accessibility**, **Integration tests**, and **make run**. Run the ones your change can affect, locally, before pushing. Then also exercise the behavior itself, through the API, a script or a screenshot, because tests prove less than seeing it work.

## Commands

| What | Command | Notes |
|---|---|---|
| Types | `npm run typecheck` | builds the i18n catalogs first |
| Lint | `npm run lint` | |
| Unit | `npx vitest run [path]` | no database needed |
| Integration | `TEST_DATABASE_URL=postgres://pokefindr:pokefindr@localhost:5433/pokefindr_<name>_test npm run test:integration` | needs the local stack's Postgres (`make run` or `npm run db:up`); the mailer tests also use Mailpit |
| One integration file | `… npx vitest run --config vitest.integration.config.mts __tests__/integration/<file>.test.ts` | |
| E2E | `npm run test:e2e` | Playwright; needs the app running (see `docs/auth.md`, "End-to-end tests") |
| Storybook a11y | `npm run test-storybook:local` | when components or stories change |

## Integration databases

Integration setup **drops and recreates** the database in `TEST_DATABASE_URL`, and refuses any name that doesn't end in `_test`. Give each concurrent run its own name, such as `pokefindr_review287_test`. Otherwise two runs, for example yours and a reviewer subagent's, wipe each other's data mid-test and fail in confusing ways. Never point it at a dev database.

## Things that are easy to miss

- **Copy goes in both catalogs.** User-facing text lives in `messages/en.yml` and `messages/es.yml`; a test checks every key exists in every catalog. See `docs/i18n.md`, "Adding copy".
- **Don't run `prettier --write`** over files. The repo's code isn't Prettier-formatted at the config's width, so it reformats whole files and buries your change in the diff. Match the surrounding style instead.
- **Public API changes** (`/api/locations`, MCP tools) need their integration tests and docs updated. `e2e/auth.e2e.ts` also calls the locations API.
- **Building without a database:** the CI build has no secrets. Pages that read the database must fail softly (see `orNullWithoutDb` on the landing page).
- **Scripts that touch real data** (imports, `canary:plant`, `firewall`) should be tried on a throwaway database or in dry-run mode first.

## Reporting

Say exactly what you ran and what passed. Name anything you couldn't run, and why, instead of implying it passed.
