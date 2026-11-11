# Core

What every module needs and no plan can remove (docs/architecture.md). Core never imports a module:
it reaches them only through `src/modules/registry.ts` and slots.

- **`shell/`**: the module system. `module.ts` defines manifests (`defineModule`) and the
  registry's checks; slots (`<Slot>`, #324) come next.
- **`access/`**: who may do what. `entitlements.ts` is the permission table, built from core's
  own entitlements and every registered module's, with `can()`, `entitlementsOf()` and
  `rolesWith()`. API routes check it with `requireEntitlement` (src/server/admin/access.ts).
- **Still outside `src/core`**: the location graph (`src/server/services/locations.ts`,
  `src/lib/locations`) and accounts (`src/server/auth`, `services/users.ts`). They move here as
  the extractions (#327–#333) make clear what's core and what's a module; until then, treat them
  as core.

`src/lib/auth/entitlements.ts` re-exports `access/entitlements.ts` so existing imports keep
working; the re-export goes when the boundaries are locked (#338).
