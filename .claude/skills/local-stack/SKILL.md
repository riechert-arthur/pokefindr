---
name: local-stack
description: Run and troubleshoot PokeFindr's local Docker stack (make run, branch databases, the dev user, Mailpit, Storybook). Use when someone pastes make run / docker compose output, says the app won't start, "init didn't complete successfully", asks how to log in locally, wants an admin or moderator account, or asks about make fresh / prune / reset.
---

# The local stack

`make run` starts everything in Docker and is safe to rerun: Postgres + PostGIS, an `init` container (branch database → migrations → `db:check` → seed), Next.js on :3000, Storybook on :6006, and Mailpit on :8025 (emails the app sends land there). Ports can be overridden: `make run WEB_PORT=3001 DB_PORT=5434 STORYBOOK_PORT=6007`. Details: `docs/database.md`, "Local development".

## Branch databases

Each git branch gets its own database, so a migration tried on one branch never reaches another.

- `main` → `pokefindr`.
- Any other branch → `pokefindr_b_<branch>_<hash>` (`scripts/dev/db-name.sh`), copied from `pokefindr` on first run.
- If `main`'s database doesn't fit the branch, the branch starts empty.
- If a migration the branch's database already ran has since changed or disappeared, the next `make run` drops and rebuilds that branch's database.
- `main`'s database only gets a warning, never a rebuild.

## Make targets

| Target | Does | Data loss |
|---|---|---|
| `make run` | start or update everything | none |
| `make fresh` | drop **this branch's** database, then run | that branch's local data |
| `make prune` | drop databases of deleted local branches | those branches' data |
| `make reset` | delete **all** local databases and `node_modules` volumes, then run | everything local |
| `make logs` / `make stop` / `make shell` | follow output / stop / shell in web | none |

Suggest the smallest one that fixes the problem. Let the person run anything that deletes data, unless they've asked you to.

## Reading a failure

`make run` prints the last 40 lines of `init`, `web` and `storybook`. Find `init`'s last step:

- **`db:check` drift after "Nothing to apply":** the database ran an older version of a migration. Run `make fresh` (see `schema-change`).
- **"Created an empty database … has migrations this branch doesn't":** expected after `main` moved on; rebase or merge `main` to get its data.
- **A missing variable:** `make run` lists the variables the app needs. `.env.local` is created from `.env.template` once and never edited by the tooling.
- **Old branch:** check `git status -sb`. If the branch is far behind or already merged, switching to `main` is often the real fix.

Next.js warnings in `web` (for example the metadata `viewport` notice) are noise, not the cause.

## Logging in

The seed adds ready-made accounts, only on local databases, all with the password `pokefindr-dev-password!`: `dev@pokefindr.local` is an admin. The list is `DEV_ACCOUNTS` in `scripts/db/seedDevUsers.ts`, and the accounts table is in `docs/auth.md` ("Local development"). Roles live in `profiles.role`; the seed sets seeded accounts' roles back on every run, so for a one-off role change use an account you signed up yourself:

```bash
docker compose exec db psql -U pokefindr -d "$(scripts/dev/db-name.sh)" \
  -c "update profiles set role = 'moderator' where username = '<yours>'"
```

Then sign out and back in so the session picks up the role.

## Host tools

`node_modules` and `.next` live in Docker volumes. For editor type checking and tests, run `npm install` on the host too, after pulling changes to `package.json`. `.env.local`'s `DATABASE_URL` points at `main`'s database; `make run` prints the current branch's URL for host tools.
