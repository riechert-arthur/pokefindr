"use client"

import { useCallback } from "react"
import { useLocale, useTranslations } from "next-intl"
import type { Messages } from "./messages"
import { DEFAULT_LOCALE } from "./routing"

type Code = keyof Messages["apiErrors"]

/** An API error body: the English `error`, and the `code` and `values` the catalog needs (src/server/api-error.ts). */
export type ApiErrorBody = { error?: unknown; code?: unknown; values?: Record<string, string | number> }

/**
 * Turns an API error into the page's language (#185). English pages show the
 * API's own `error`, which can be more specific (which field, Better Auth's
 * reason). Other languages show the catalog's message for its `code`, else
 * that English `error`. Either way `fallback` when there's neither.
 */
export function useApiError() {
  const t = useTranslations("apiErrors")
  const locale = useLocale()
  return useCallback(
    (body: ApiErrorBody | null | undefined, fallback?: string): string => {
      const error = typeof body?.error === "string" && body.error ? body.error : null
      if (locale === DEFAULT_LOCALE && error) return error
      const code = typeof body?.code === "string" ? body.code : null
      if (code && t.has(code as Code)) return t(code as Code, body?.values ?? {})
      return error ?? fallback ?? t("unexpected")
    },
    [t, locale],
  )
}
