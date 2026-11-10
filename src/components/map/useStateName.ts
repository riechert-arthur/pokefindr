"use client"

import { useCallback } from "react"
import { useTranslations } from "next-intl"
import type { Messages } from "@/i18n/messages"
import { STATES } from "@/lib/map/states"

type StateCode = keyof Messages["states"]

/** A US state's or territory's name in the page's language ("Nueva York"), from its code (#184). */
export function useStateName(): (code: string) => string {
  const t = useTranslations("states")
  return useCallback((code: string) => (t.has(code as StateCode) ? t(code as StateCode) : (STATES[code]?.name ?? code)), [t])
}
