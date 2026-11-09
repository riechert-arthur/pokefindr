"use client"

import { useCallback } from "react"
import { useTranslations } from "next-intl"
import type { Messages } from "./messages"

type Code = keyof Messages["apiErrors"]

/** An API error body: the English `error`, and the `code` and `values` the catalog needs (src/server/api-error.ts). */
export type ApiErrorBody = { error?: unknown; code?: unknown; values?: Record<string, string | number> }

/**
 * Turns an API error into the page's language (#185): the catalog's message
 * for its `code`, else the API's own English `error`, else `fallback`.
 */
export function useApiError() {
  const t = useTranslations("apiErrors")
  return useCallback(
    (body: ApiErrorBody | null | undefined, fallback?: string): string => {
      const code = typeof body?.code === "string" ? body.code : null
      if (code && t.has(code as Code)) return t(code as Code, body?.values ?? {})
      if (typeof body?.error === "string" && body.error) return body.error
      return fallback ?? t("unexpected")
    },
    [t],
  )
}
