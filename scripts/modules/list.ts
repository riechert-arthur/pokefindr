/**
 * npm run -s modules:list (#326): the registered modules' ids as a JSON
 * array, for CI's removal-check matrix, so a new module joins it by being
 * registered.
 */
import { MODULES } from "@/modules/registry"

console.log(JSON.stringify(MODULES.map((m: { id: string }) => m.id)))
