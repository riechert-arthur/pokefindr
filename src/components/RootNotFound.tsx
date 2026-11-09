"use client"

import { NextIntlClientProvider } from "next-intl"
import { NotFoundContent } from "@/components/ErrorPage"
import en from "@/i18n/generated/en.json"

/**
 * The 404 outside any language, in English. Its provider is the client one on
 * purpose: Next renders the root not-found page with every page, and next-intl's
 * server provider would read the request headers there, making every page dynamic.
 */
export function RootNotFound() {
  return (
    <NextIntlClientProvider locale="en" messages={{ errors: en.errors }} timeZone="UTC">
      <NotFoundContent />
    </NextIntlClientProvider>
  )
}
