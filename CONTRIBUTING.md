# Contributing

## Before you open a PR

```sh
npm run lint
npx tsc --noEmit
npx vitest run --exclude "__tests__/integration/**"
npm run build             # Next-only errors (server/client boundaries, route exports)
npm run build-storybook   # if you touched UI
```

If you touched UI, also run the accessibility checks on the Storybook build
([how](docs/design-system.md#accessibility)). CI runs all of the above, plus the integration tests
(Postgres).

## UI work

Read [docs/design-system.md](docs/design-system.md) first. In short:

- Colors, type sizes and shadows come from tokens. Lint fails on palette or raw colors.
- Use the shadcn components in `src/components/ui` and the PokeFindr ones in
  `src/components/pokefindr` before writing new markup.
- Every component in those folders has a story in `src/stories/`. Check it in light and dark with
  Storybook, which `make run` starts on http://localhost:6006.
- UI icons are lucide; icon-only buttons need an `aria-label`.

## Other guides

- [Database and migrations](docs/database.md)
- [Background jobs](docs/jobs.md)
