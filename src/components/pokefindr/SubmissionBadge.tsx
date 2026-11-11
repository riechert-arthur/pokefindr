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

/** What a submission's status means for it, one line: why it wasn't approved, that it's over or gone, or what pending and live mean. */
export function SubmissionNote({ submission: s }: { submission: MySubmission }) {
  const t = useTranslations("map.submissions")
  if (s.status === "rejected") return <>{s.rejectReason ? t(`rejectReasons.${s.rejectReason}`) : t("notApproved")}</>
  if (s.status === "approved" && s.locationActive === false) return <>{s.kind === "event" ? t("over") : t("gone")}</>
  return <>{t(s.status)}</>
}
