"use client"

import { useEffect } from "react"
import { useTranslations } from "next-intl"
import { ErrorPage } from "@/components/ErrorPage"

export default function GlobalError({ error }: { error: Error; reset: () => void }) {
  const t = useTranslations("errors.error")
  useEffect(() => console.error(error), [error])
  return (
    <ErrorPage code={t("code")} title={t("title")}>
      {error.message}
    </ErrorPage>
  )
}
