# Modules

Features that plug into the core (docs/architecture.md). Each module is one folder:

```text
src/modules/<id>/
  module.ts      # the manifest: defineModule({ id, name, requires, entitlements, roles, contributes })
  index.ts       # its public API, for modules that `require` it (no deep imports)
  README.md      # read this first: what it owns, its entitlements, the slots it fills, how to test it
  server/        # services and queries ("server-only")
  ui/            # components that fill slots
  shared/        # client-safe types, schemas, constants
  db/schema.ts   # its tables
  messages/      # its copy, en.yml and es.yml
```

- **`registry.ts`** is the only list of built-in modules. Adding a module is a new folder plus one
  line there; removing one is deleting both (and its route files under `src/app`).
- **Entitlements and module roles are prefixed with the module's id** (`events.manage`,
  `events.editor`). The types and the registry's startup check both enforce it.
- **A module's README names every entitlement in its manifest**; a test checks it. Keep it under
  a page: it's what an agent (or a person) reads before working on the module.
- **Core never imports a module.** It reaches them through the registry and slots (#324). The
  boundary lint (#325) and the removal check (#326) enforce that.

There are no modules yet: the first is `ads` (#327), then the extractions in #328–#333.

## Slots

What a module adds to core screens goes in its manifest's `contributes`, by slot name
(`src/core/shell/slots.ts` lists them and their props). Server-side contributions (assistant and
MCP tools, job code, sitemap entries) go in `module.server.ts`, listed in `registry.server.ts`, so
the browser bundle never reaches them. After adding or changing a scheduled job, run
`npm run modules:sync` to update `vercel.json`.
