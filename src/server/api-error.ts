import { NextResponse } from "next/server"
import type { Messages } from "@/i18n/messages"

/** A message in the catalog's `apiErrors`: a code that isn't there fails typecheck. */
export type ApiErrorCode = keyof Messages["apiErrors"]

/**
 * An error the pages show (#185): the English `error` for anyone reading the
 * API, and a stable `code` the page shows from its catalog (`apiErrors` in
 * messages/*.yml), with `values` for its placeholders.
 */
export function apiError(code: ApiErrorCode, error: string, status: number, extra: Record<string, unknown> = {}, init: ResponseInit = {}) {
  return NextResponse.json({ error, code, ...extra }, { ...init, status })
}
