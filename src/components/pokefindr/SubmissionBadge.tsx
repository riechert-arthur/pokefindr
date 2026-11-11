"use client"

import { useTranslations } from "next-intl"
import { StatusBadge } from "@/components/pokefindr/StatusBadge"
import type { MySubmission } from "@/lib/submissions/schemas"

/** A submission's status, as its submitter sees it: Pending review, Live, Ended or Off the map, or Not approved. */
export function SubmissionBadge({ submission: s }: { submission: MySubmission }) {
  const t = useTranslations("map.submissions")
  if (s.status === "pending") return <StatusBadge status="pending" />
  if (s.status === "rejected") {
    return (
      <StatusBadge status="sample" className="border-destructive/40 text-destructive">
        {t("notApproved")}
      </StatusBadge>
    )
  }
  if (s.locationActive === false) return <StatusBadge status="sample">{s.kind === "event" ? t("ended") : t("offMap")}</StatusBadge>
  return <StatusBadge status="live" />
}
