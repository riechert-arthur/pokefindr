import "server-only"
import { NextResponse } from "next/server"

/**
 * An error the pages show (#185): the English `error` for anyone reading the
 * API, and a stable `code` the page shows from its catalog (`apiErrors` in
 * messages/*.yml), with `values` for its placeholders.
 */
export function apiError(code: string, error: string, status: number, extra: Record<string, unknown> = {}, init: ResponseInit = {}) {
  return NextResponse.json({ error, code, ...extra }, { ...init, status })
}
