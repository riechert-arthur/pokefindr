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
overwrite anything the client sent. Since those calls come from our server, Better Auth can't
see whether another site's page made the browser send them, so our routes refuse those requests
themselves (`refuseCrossSite`). Its emails go out after the response (Next's `after()`), so a request
that sends one answers as fast as one that doesn't.

### The flows

- **Sign up** (`/signup`): creates the user and the profile, then emails a confirmation link. A taken
  email gets the same answer as a new one, and claims the username for a day just the same
  (`username_holds`), so the username can't show which emails have accounts. An account left
  unconfirmed for a day (its link has expired) gives up its username too, and is removed when
  someone else takes the name. Better Auth's own
  sign-up, login and change-email endpoints aren't reachable at `/api/identity`: they skip the
  profile and our checks.
- **Confirm**: the link (24 hours) lands on `/login?verified=1`. Logging in before confirming sends a
  new link.
- **Log in** (`/login`): email and password, or Google or Discord. A new OAuth user picks a username
  on `/login/callback` first. Google or Discord can only make an account from an email they have
  confirmed (Discord allows unconfirmed ones), so nobody can sign up as an address's owner. An
  unconfirmed one is swapped for a placeholder before the lookup, so the error doesn't say whether it
  has an account, and someone whose provider account is already linked still gets in.
  A wrong password and an unconfirmed email get the same login answer.
- **Forgot password** (`/forgot-password`): emails a link (1 hour, single use) to `/reset-password`.
  A reset ends every other session and also confirms the email. Opening the link proves the
  address belongs to them, so someone who signed up with that email can't keep its owner out.
- **Change email** (`/settings`): the current address approves, then the new one confirms. Nothing
  changes before both, and only a confirmed email can be changed. An address another account has
  gets the same approval email, then nothing, so the old inbox can't tell which addresses have
  accounts.
- **Linking**: an OAuth sign-in joins an existing account with the same email only when both sides
  have confirmed it.

## MCP clients (OAuth)

MCP clients (Claude, Cursor, VS Code, ...) connect to a person's account through OAuth 2.1, with
PokeFindr as the authorization server (#134). It's Better Auth's `mcp` plugin (its OAuth Provider),
with `jwt` signing the access tokens and `cimd` reading Client ID Metadata Documents. Setup is in
`mcpPlugins` in `src/server/auth/auth.ts`; the tables are migration `0014_mcp_oauth`.

| Piece | Where |
| --- | --- |
| Discovery: `/.well-known/oauth-protected-resource/api/mcp/account`, `/.well-known/oauth-authorization-server/api/identity` | `src/server/auth/discovery.ts` |
| Authorize, token, register, consent, JWKS | Better Auth, at `/api/identity/oauth2/*` and `/api/identity/jwks` |
| Consent page | `/oauth/consent` |
| Picking the flow up after logging in | `src/lib/auth/oauth-continue.ts` |
| Scopes and what the consent page says for each | `src/lib/mcp/scopes.ts` |

1. The client finds the authorization server from the protected-resource document, then registers:
   a Client ID Metadata Document (the 2026-07-28 way), or dynamic registration (the 2025 way, which
   most clients still use; at most 5 a minute per IP). Clients are public: PKCE, no secret.
2. Authorize sends someone without a session to `/login` with the request signed in the query. Our
   login goes through our own routes, so once it succeeds (email, Google or Discord) the page sends
   the browser back to the authorize endpoint with the same request (`authorizeContinuation`).
   That's the only place `next` can lead.
3. `/oauth/consent` shows the app's name (its own registration, as plain text), the redirect's host
   (checked by the authorize endpoint) and what it's asking for. Allow or Cancel goes to Better
   Auth's consent endpoint, which sends the browser back to the app.
4. The token endpoint issues an access token (a JWT, 1 hour, audience `/api/mcp/account`) and a
   refresh token (30 days, rotated; reuse within 30 s counts as a retry). Reusing a code revokes
   what it was exchanged for.

The signing keys (`jwks`) are encrypted with `BETTER_AUTH_SECRET`: changing it means new keys, and
every connected app has to connect again.

There's no "connected apps" page yet to disconnect an app from PokeFindr's side; people disconnect it
in the app.

## Roles and entitlements

Everyone signed in has a role in `profiles.role` (migrations 0012 and 0022). It's read from the database on each request, not stored in the session, so a change applies on the person's next request (the client's `SessionProvider` keeps showing the old role until it fetches the session again, e.g. on the next page load).

| Role | Can | Who grants it |
| --- | --- | --- |
| `member` | everything a signed-in person can: reviews, reports, submissions | sign-up; a super admin |
| `moderator` | `/moderate`: the review queue and Reports, but not deciding their own submissions | a super admin, in Admin → Users |
| `admin` | `/moderate`, all of `/admin` except Users, and deciding their own submissions | a super admin, in Admin → Users |
| `super_admin` | everything an admin can, plus Admin → Users (`users.manage`) | SQL or the dev seed only |

**Moderators' dashboard** (`/moderate`, #293): the review queue and Reports as two tabs (`?tab=reports`), inside the normal app layout, for whoever has `moderation.view`. The rail and tab bar show "Moderate" for `moderation.view` and "Admin" for `admin.open`, which moderators don't have: `/admin` redirects them to `/moderate` (old emails and bookmarks point there), and the review email links to `/moderate`. Admins keep the same two sections in `/admin`'s Moderation group too.

**User management** (`/admin?section=users`, #294) lists users with their email (only super admins see emails), searches by username, name or the start of an email, filters by role, and changes a role after a confirm step (`src/server/services/user-admin.ts`, `GET /api/admin/users`, `PATCH /api/admin/users/:id`). A super admin can set member, moderator or admin, never their own role, and never `super_admin`, so a hijacked session can't create another one. Taking away the last super admin is refused too. Every change is written to `role_changes`. To make someone a super admin:

```sql
update profiles set role = 'super_admin' where username = '…';
```

What each role may do is decided in one place, `src/lib/auth/entitlements.ts` (#299). It maps each **entitlement**, named after what it allows (`moderation.decide`, `admin.jobs`), to the roles that have it:

```ts
import { can } from "@/lib/auth/entitlements"

can(role, "admin.jobs") // true for admins only
```

- **Server checks:** admin API routes use `requireEntitlement(request, "admin.jobs")` from `src/server/admin/access.ts`. It answers 401 without a session and 404 to anyone without the entitlement, so the route's existence isn't shown.
- **UI:** components use `can()` to hide what someone can't use. That's cosmetic; the server check is what protects the data.
- **Admin sections:** each section in `src/lib/admin/sections.ts` names the entitlement it needs.
- **Never compare role names elsewhere.** A test (`__tests__/lib/entitlements.test.ts`) fails on `role === "admin"`-style checks outside `entitlements.ts`.

**To add an entitlement,** add an entry with the roles that get it, use `can` or `requireEntitlement` where it applies, and update the snapshot in `__tests__/lib/entitlements.test.ts`.

**To add a role,** add it to `ROLES` (`src/lib/auth/roles.ts`) and to the `profiles_role_check` constraint with a migration. Then list it under each entitlement it should have. A role that isn't listed anywhere can do nothing beyond a member.

## Local development

`make run` (or `npm run db:seed`) seeds confirmed, onboarded accounts into local databases only
(localhost or the `db` container; `scripts/db/seed.ts` checks). They all use the password
`pokefindr-dev-password!`:

| Email | Username | Role | For testing |
| --- | --- | --- | --- |
| `superadmin@pokefindr.local` | `superadmin` | super_admin | Admin → Users, plus everything an admin has |
| `dev@pokefindr.local` | `dev` | admin | every section of `/admin` except Users |
| `moderator@pokefindr.local` | `moderator` | moderator | `/moderate` (`/admin` sends it there); can't decide its own submissions; gets the review emails |
| `ash@pokefindr.local` | `ash` | member | a plain member: no Admin link, `/admin` is a 404 |
| `misty@pokefindr.local` | `misty` | member | the same |
| `brock@pokefindr.local` | `brock` | member | the same |
| `serena@pokefindr.local` | `serena` | member | the same, with emails and pages in Spanish (`locale` `es`) |

The accounts are `DEV_ACCOUNTS` in `scripts/db/seedDevUsers.ts`; add an entry to seed another.
Each run adds missing accounts and sets an existing account's role back to the seeded value, so a
seeded account always means the same thing, on new and existing branch databases alike. To try
a role change, use an account you signed up yourself.

The seed also adds three pending submissions (from `ash`, `brock` and `serena`) and an open report
(from `misty`), all named or marked as samples, so the review queue and Reports have something in
them on a new database (`scripts/db/seedModeration.ts`). They have fixed ids: one you approve or
reject stays decided on the next seed.

Every email the app sends goes to Mailpit at http://localhost:8025. Running `npm run dev` outside
Docker, `MAIL_PROVIDER` defaults to `console`, which prints each email (and its link) in the
server log.

### End-to-end tests

`e2e/auth.e2e.ts` runs the flows in a browser against a running stack: sign up, confirm from
Mailpit, log in, post a review, log out, reset the password, and the dev user. CI's `make run`
job runs it on every pull request.

```bash
make run
npx playwright install chromium   # once
npm run test:e2e
```

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
`SUPABASE_SERVICE_ROLE_KEY`) are no longer read. Keep them in Vercel until the rollback window
below ends: the build before this one needs them to start. `SUPABASE_URL` and `SUPABASE_KEY` are
still used by the Python location scripts (#51).

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
5. **Rollback:** use Vercel's Instant Rollback to the previous deployment, which keeps that
   deployment's build and settings. Don't redeploy an older commit instead: that rebuilds it with
   today's variables. The Supabase project has been unreachable since 2026-11-05
   (`plans/db_provider_decision.md`), so the previous build brings back the map and listings, but
   not signing in. Keep its variables in Vercel for two weeks, so it still starts, then remove them.

## Known limits

- `app_session` is a JWT. A password reset revokes Better Auth's sessions, but an `app_session`
  issued earlier stays valid until it expires (up to 7 days). Revoking those would mean checking
  the Better Auth session in middleware (a database call per request) or keeping a deny-list.
