This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Docs

- [Design system](docs/design-system.md): tokens, type, components, and how to add one
- [Database](docs/database.md) · [Background jobs](docs/jobs.md)
- [Contributing](CONTRIBUTING.md)

## Getting Started

With Docker running:

```bash
make run    # database, migrations, seed data and the app, all in Docker
```

Then open http://localhost:3000 and log in with one of the seeded accounts below (local databases only). Emails the app sends, such as sign-up confirmations, land in Mailpit at http://localhost:8025. `make run` is safe to rerun at any time, e.g. after a pull. `make help` lists the other commands (`stop`, `logs`, `shell`, `prune`, `reset`). Each git branch gets its own local database. See [docs/database.md](docs/database.md) for details.

Every seeded account uses the password `pokefindr-dev-password!`:

| Email | Role | For testing |
| --- | --- | --- |
| `superadmin@pokefindr.local` | super_admin | Admin → Users, plus everything an admin has |
| `dev@pokefindr.local` | admin | every section of `/admin` except Users |
| `moderator@pokefindr.local` | moderator | `/moderate` (`/admin` sends it there); can't decide its own submissions; gets the review emails |
| `ash@pokefindr.local`, `misty@pokefindr.local`, `brock@pokefindr.local` | member | a plain member: no Admin link, `/admin` is a 404 |
| `serena@pokefindr.local` | member | the same, with emails and pages in Spanish |

The seed puts each account's role back on every run, so change roles on an account you signed up yourself. The list lives in `DEV_ACCOUNTS` in `scripts/db/seedDevUsers.ts`.

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
