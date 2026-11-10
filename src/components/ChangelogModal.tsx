
"use client"

import type { FC } from "react"
import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { NEWEST_RELEASE } from "@/lib/changelog"

/**
 * The release the pop-up announces: the newest in src/lib/changelog.ts, and
 * its changes (some in shorter words than the changelog page). A new release
 * needs its own list here, with its messages in content.changelog.
 */
const RELEASE = {
  version: NEWEST_RELEASE.version,
  released: `${NEWEST_RELEASE.key}.released`,
  items: ["modal.items.accounts", "v1_2.items.reviews", "modal.items.settings", "modal.items.sso", "v1_2.items.ratings"],
} as const
const CURRENT_CHANGELOG_VERSION = RELEASE.version

const ChangelogModal: FC = () => {
  const t = useTranslations("content.changelog")
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    const seen = localStorage.getItem("changelog_seen_version")
    if (seen !== CURRENT_CHANGELOG_VERSION) {
      setIsOpen(true)
    }
  }, [])

  const handleClose = () => {
    localStorage.setItem("changelog_seen_version", CURRENT_CHANGELOG_VERSION)
    setIsOpen(false)
  }

  if (!isOpen) return null

  return (
    <div onClick={handleClose} className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1000]">
      <div onClick={(e) => e.stopPropagation()} className="bg-card rounded-lg shadow-lg max-w-md w-full mx-4 p-6">
        <h2 className="text-xl font-semibold mb-2">
          {t("title", { version: CURRENT_CHANGELOG_VERSION })}
        </h2>
        <p className="text-sm text-muted-foreground mb-4">{t(RELEASE.released)}</p>
        <ul className="list-disc list-inside space-y-1 mb-6">
          {RELEASE.items.map((key) => (
            <li key={key}>{t.rich(key, { b: (chunks) => <strong>{chunks}</strong>, i: (chunks) => <i>{chunks}</i> })}</li>
          ))}
        </ul>
        <button
          onClick={handleClose}
          className="w-full bg-primary text-primary-foreground py-2 rounded hover:bg-primary/90 hover:cursor-pointer"
        >
          {t("modal.close")}
        </button>
      </div>
    </div>
  )
}

export default ChangelogModal;

