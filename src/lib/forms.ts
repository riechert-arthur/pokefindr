"use client"

import { useCallback } from "react"
import axios from "axios"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { useApiError, type ApiErrorBody } from "@/i18n/useApiError"

/**
 * A toast for a failed form request, in the page's language (#185): the
 * catalog's message for the API's error code, else its English message,
 * else what went wrong with the request itself.
 */
export function useSubmitError() {
  const apiError = useApiError()
  const t = useTranslations("apiErrors")
  return useCallback(
    (err: unknown) => {
      if (!axios.isAxiosError(err)) return void toast.error(t("unexpected"))
      const status = err.response?.status
      if (!status) return void toast.error(t("offline"))
      const payload = err.response?.data as unknown
      if (typeof payload === "string" && payload.trim()) return void toast.error(payload.trim())
      const body = payload !== null && typeof payload === "object" ? (payload as ApiErrorBody & { message?: unknown }) : null
      // Better Auth's own errors (/api/identity) say `message`.
      const fallback = typeof body?.message === "string" ? body.message : t("status", { status })
      toast.error(apiError(body, fallback))
    },
    [apiError, t],
  )
}
