"use client"

import { useCallback } from "react"
import axios from "axios"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { useApiError, type ApiErrorBody } from "@/i18n/useApiError"

/**
 * The message for a failed form request, in the page's language (#185): the
 * catalog's message for the API's error code, else its English message,
 * else what went wrong with the request itself. For errors shown next to a field.
 */
export function useSubmitErrorMessage() {
  const apiError = useApiError()
  const t = useTranslations("apiErrors")
  return useCallback(
    (err: unknown): string => {
      if (!axios.isAxiosError(err)) return t("unexpected")
      const status = err.response?.status
      if (!status) return t("offline")
      const payload = err.response?.data as unknown
      if (typeof payload === "string" && payload.trim()) return payload.trim()
      const body = payload !== null && typeof payload === "object" ? (payload as ApiErrorBody & { message?: unknown }) : null
      // Better Auth's own errors (/api/identity) say `message`.
      const fallback = typeof body?.message === "string" ? body.message : t("status", { status })
      return apiError(body, fallback)
    },
    [apiError, t],
  )
}

/** A toast for a failed form request, with the message from useSubmitErrorMessage. */
export function useSubmitError() {
  const message = useSubmitErrorMessage()
  return useCallback((err: unknown) => void toast.error(message(err)), [message])
}
