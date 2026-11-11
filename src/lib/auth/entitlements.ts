/**
 * Moved to src/core/access/entitlements.ts (#323), which builds the table from
 * core's entitlements and the registered modules'. This re-export keeps the
 * old import path working until the boundaries are locked (#338).
 */
export { can, ENTITLEMENTS, entitlementsOf, rolesWith, type Entitlement } from "@/core/access/entitlements"
