"use client"

import { useId, useRef, useState, type ChangeEvent } from "react"
import { useTranslations } from "next-intl"
import { UserAvatar } from "@/components/pokefindr/UserAvatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AVATAR_MAX_BYTES, AVATAR_TYPES } from "@/lib/avatars"
import { cn } from "@/lib/utils"

interface ProfilePictureFieldProps {
  /** The username, for the initial when there's no picture. */
  name: string
  image: string | null | undefined
  /** Uploads the chosen file. Resolve to a string to show that error under the row. */
  onUpload: (file: File) => Promise<string | void>
  /** Removes the picture. Resolve to a string to show that error under the row. */
  onRemove: () => Promise<string | void>
  className?: string
}

/**
 * The "Profile picture" row of the settings Profile list (#290): a preview, an
 * Upload button for a visually hidden file input, and Remove. Size and type are
 * checked here first so a wrong file fails at once; the server checks again.
 */
export function ProfilePictureField({ name, image, onUpload, onRemove, className }: ProfilePictureFieldProps) {
  const t = useTranslations("settings.avatar")
  const id = useId()
  const inputId = `${id}-file`
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const file = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(kind: "upload" | "remove", action: () => Promise<string | void>) {
    setBusy(kind)
    setError(null)
    try {
      setError((await action()) || null)
    } finally {
      setBusy(null)
    }
  }

  function chosen(e: ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0]
    // Clear it, so choosing the same file again still fires a change.
    e.target.value = ""
    if (!picked) return
    if (!(AVATAR_TYPES as readonly string[]).includes(picked.type)) return setError(t("wrongType"))
    if (picked.size > AVATAR_MAX_BYTES) return setError(t("tooLarge"))
    void run("upload", () => onUpload(picked))
  }

  return (
    <div className={cn("py-6 sm:flex", className)}>
      <dt className="sm:w-64 sm:flex-none sm:pr-6">
        <Label htmlFor={inputId} className="text-body font-medium leading-6 text-foreground">
          {t("label")}
        </Label>
      </dt>
      <dd className="mt-2 sm:mt-0 sm:flex-auto">
        <div className="flex flex-wrap items-center gap-4">
          <UserAvatar name={name} imageUrl={image} size="lg" />
          <div className="grid gap-1.5">
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => file.current?.click()} disabled={busy !== null} aria-describedby={error ? `${hintId} ${errorId}` : hintId}>
                {busy === "upload" ? t("uploading") : t("upload")}
              </Button>
              {image && (
                <Button type="button" size="sm" variant="ghost" onClick={() => void run("remove", onRemove)} disabled={busy !== null}>
                  {busy === "remove" ? t("removing") : t("remove")}
                </Button>
              )}
            </div>
            <p id={hintId} className="text-caption text-muted-foreground">
              {t("hint")}
            </p>
          </div>
        </div>
        {/* The Upload button opens it; it's out of the tab order, since the button is the control. */}
        <Input ref={file} id={inputId} type="file" accept={AVATAR_TYPES.join(",")} onChange={chosen} tabIndex={-1} className="sr-only" />
        {error && (
          <p id={errorId} role="alert" className="mt-2 text-caption text-destructive">
            {error}
          </p>
        )}
      </dd>
    </div>
  )
}
