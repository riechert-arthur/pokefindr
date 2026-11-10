import { useMemo } from "react"
import { useTranslations } from "next-intl"
import { authSchemas, type AuthSchemas } from "@/lib/schemas"

/** The auth forms' schemas, with their messages in the page's language. */
export function useAuthSchemas(): AuthSchemas {
  const t = useTranslations("auth.validation")
  return useMemo(() => authSchemas((key) => t(key)), [t])
}
