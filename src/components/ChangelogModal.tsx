"use client"

import type { FC } from "react"
import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Link } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { NEWEST_RELEASE, releasedOn } from "@/lib/changelog"

/** The release the pop-up announces: the newest in src/lib/changelog.ts, with its highlights (or, without them, all its changes). */
const RELEASE = NEWEST_RELEASE
const ITEMS = "highlights" in RELEASE ? RELEASE.highlights : RELEASE.items
const CURRENT_CHANGELOG_VERSION = RELEASE.version
const SEEN_KEY = "changelog_seen_version"

/**
 * "What's new" once after a release, on the signed-in pages. A dialog from
 * the design system: focus stays inside, Escape and the overlay close it.
 */
const ChangelogModal: FC = () => {
  const t = useTranslations("content.changelog")
  const [isOpen, setIsOpen] = useState(false)

  // Only for someone who has been here before a release: a first visit has
  // nothing to catch up on, and a pop-up over the map would be the first
  // thing it painted (its largest element, #298). Storage blocked: no pop-up.
  useEffect(() => {
    try {
      const seen = localStorage.getItem(SEEN_KEY)
      if (seen === null) localStorage.setItem(SEEN_KEY, CURRENT_CHANGELOG_VERSION)
      else if (seen !== CURRENT_CHANGELOG_VERSION) setIsOpen(true)
    } catch {
      // Private mode or blocked storage.
    }
  }, [])

  const handleClose = () => {
    try {
      localStorage.setItem(SEEN_KEY, CURRENT_CHANGELOG_VERSION)
    } catch {
      // It shows again next visit.
    }
    setIsOpen(false)
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      {/* On phones, a margin and rounded corners rather than edge to edge. */}
      <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-lg">
        <DialogHeader>
          <DialogTitle>{t("title", { version: CURRENT_CHANGELOG_VERSION })}</DialogTitle>
          <DialogDescription>{t("released", { date: releasedOn(RELEASE) })}</DialogDescription>
        </DialogHeader>
        <ul className="grid list-disc gap-1.5 pl-5 text-body">
          {ITEMS.map((key) => (
            <li key={key}>{t.rich(key, { b: (chunks) => <strong>{chunks}</strong>, i: (chunks) => <i>{chunks}</i> })}</li>
          ))}
        </ul>
        <DialogFooter className="gap-2 sm:justify-between sm:space-x-0">
          <Button asChild variant="ghost" onClick={handleClose}>
            <Link href="/changelog">{t("modal.more")}</Link>
          </Button>
          <Button type="button" onClick={handleClose}>
            {t("modal.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ChangelogModal
