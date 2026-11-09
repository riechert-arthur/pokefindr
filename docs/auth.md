# Accounts and sign-in

PokeFindr's accounts live in our own Postgres, managed by [Better Auth](https://www.better-auth.com),
a library inside the app (not a hosted service). Nothing about signing in depends on an outside
provider except the email service and, if enabled, Google or Discord.

## How it fits together

| Piece | Where |
| --- | --- |
| Better Auth instance (password rules, emails, OAuth, rate limits) | `src/server/auth/auth.ts` |
| Better Auth's own endpoints: OAuth callbacks, email links, password reset | `/api/identity/*` |
| Our routes the forms call: sign-up, login, logout, OAuth finish, onboarding | `/api/auth/*` |
| Tables: `users`, `accounts`, `sessions`, `verifications`, `auth_rate_limits` | migration `0009_identity` |
| PokeFindr's profile (username, name), sharing the user's id | `profiles` |
| The cookie middleware checks on every protected request | `app_session` (a JWT, `JWT_SECRET`) |

Login checks the password through Better Auth, then signs `app_session`, so middleware needs no
database call. Better Auth's own session cookie is kept alongside it: logout revokes it, and changing
the email needs it.

Our routes call Better Auth through its HTTP handler (`src/server/auth/identity.ts`), not `auth.api`,
because its rate limits only run on requests. They're keyed by the client IP, which Vercel puts in
`x-real-ip` and `x-forwarded-for`. Self-hosted, the proxy in front of the app must set those and
overwrite anything the client sent.

### The flows

- **Sign up** (`/signup`): creates the user and the profile, then emails a confirmation link. A taken
  email gets the same answer as a new one.
- **Confirm**: the link (24 hours) lands on `/login?verified=1`. Logging in before confirming sends a
  new link.
- **Log in** (`/login`): email and password, or Google or Discord. A new OAuth user picks a username
  on `/login/callback` first.
- **Forgot password** (`/forgot-password`): emails a link (1 hour, single use) to `/reset-password`.
  A reset ends every other session and also confirms the email. Opening the link proves the
  address belongs to them, so someone who signed up with that email can't keep its owner out.
- **Change email** (`/settings`): the current address approves, then the new one confirms. Nothing
  changes before both.
- **Linking**: an OAuth sign-in joins an existing account with the same email only when both sides
  have confirmed it.

## Local development

`make run` seeds a confirmed account into local databases only:

- **Email:** `dev@pokefindr.local`
- **Password:** `pokefindr-dev-password!`

Every email the app sends goes to Mailpit at http://localhost:8025. Running `npm run dev` outside
Docker, `MAIL_PROVIDER` defaults to `console`, which prints each email (and its link) in the
server log.

## Settings per environment

| Variable | Needed | Notes |
| --- | --- | --- |
| `APP_URL` | yes | Links in emails and OAuth redirects are built from it |
| `JWT_SECRET` | yes | Signs `app_session` |
| `BETTER_AUTH_SECRET` | recommended | 32+ characters. Unset, it's derived from `JWT_SECRET` |
| `MAIL_PROVIDER=smtp`, `SMTP_URL` | in production | `console` refuses to send in production |
| `MAIL_FROM` | in production | Its domain needs SPF and DKIM records with the SMTP provider |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | optional | Shows "Continue with Google" |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | optional | Shows "Continue with Discord" |

Each OAuth provider's console must list `${APP_URL}/api/identity/callback/google` (or `/discord`) as
a redirect URI. Preview deployments have changing URLs, so leave the OAuth variables unset there:
the buttons don't show, and email sign-in still works.

The Supabase variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`) are no longer read and can be removed. `SUPABASE_URL` and
`SUPABASE_KEY` are still used by the Python location scripts (#51).

## Cutover from Supabase

Accounts start fresh: everyone signs up again (`plans/db_provider_decision.md`), so no users or
passwords are copied. Profiles from before the move have no user row. The `profiles` → `users`
foreign key is added `NOT VALID`, so those old rows stay as they are, and every new one is checked.

1. Set the variables above in Vercel (production and preview), and add the SMTP provider's DNS
   records.
2. Merge. On `main`, `migrate.yml` applies `0009_identity` and `0010_unique_usernames` to staging,
   then production. `0010` stops with a list if any usernames are taken twice, ignoring case.
   Rename all but one of each, then rerun.
3. Deploy. On production, run a smoke test:
   - sign up, and confirm from the email
   - log in and out
   - reset the password
   - sign in with each OAuth provider
4. Watch the logs for `[auth]` errors, which include emails that failed to send.
5. **Rollback:** redeploy the previous build. Keep the Supabase project, read-only, for two weeks
   before deleting it.

## Known limits

- `app_session` is a JWT. A password reset revokes Better Auth's sessions, but an `app_session`
  issued earlier stays valid until it expires (up to 7 days). Revoking those would mean checking
  the Better Auth session in middleware (a database call per request) or keeping a deny-list.
