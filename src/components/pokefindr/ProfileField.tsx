"use client"

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

interface ProfileFieldProps {
  label: string
  value: string
  type?: "text" | "email"
  autoComplete?: string
  /** Whether this row is being edited. The page keeps one row open at a time. */
  editing: boolean
  onEdit: () => void
  onCancel: () => void
  /**
   * Saves the new value. Resolve to close the row; resolve to a string to keep it
   * open and show that error next to the field (a 409 "That username is already taken").
   */
  onSave: (value: string) => Promise<string | void>
  className?: string
}

/**
 * One row of the settings Profile list (a `<div>` of `<dt>` and `<dd>`, inside a `<dl>`):
 * the value with an Update button, or an inline form. Enter saves, Escape cancels, and
 * focus moves into the field on Update and back to Update afterwards.
 */
export function ProfileField({ label, value, type = "text", autoComplete, editing, onEdit, onCancel, onSave, className }: ProfileFieldProps) {
  const t = useTranslations("settings")
  const id = useId()
  const labelId = `${id}-label`
  const inputId = `${id}-input`
  const errorId = `${id}-error`
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const update = useRef<HTMLButtonElement>(null)
  // Only send focus back to Update after this row was open, not on first render.
  const wasEditing = useRef(false)

  useEffect(() => {
    if (editing) {
      setDraft(value)
      setError(null)
      input.current?.focus()
      input.current?.select()
    } else if (wasEditing.current) {
      update.current?.focus()
    }
    wasEditing.current = editing
    // Reset the draft when the row opens, not each time the saved value changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    try {
      const failed = await onSave(draft.trim())
      setError(failed || null)
    } finally {
      setSaving(false)
    }
  }

  function keyDown(e: KeyboardEvent) {
    if (e.key === "Escape" && !saving) {
      e.preventDefault()
      e.stopPropagation()
      onCancel()
    }
  }

  return (
    <div className={cn("py-6 sm:flex", className)}>
      <dt className="sm:w-64 sm:flex-none sm:pr-6">
        <Label id={labelId} htmlFor={inputId} className="text-body font-medium leading-6 text-foreground">
          {label}
        </Label>
      </dt>
      <dd className="mt-1 sm:mt-0 sm:flex-auto">
        {editing ? (
          <form onSubmit={submit} onKeyDown={keyDown} aria-labelledby={labelId} noValidate>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                ref={input}
                id={inputId}
                type={type}
                autoComplete={autoComplete}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                className="min-w-0 flex-1 basis-48"
              />
              <Button size="sm" type="submit" disabled={saving}>
                {saving ? t("saving") : t("save")}
              </Button>
              <Button variant="ghost" size="sm" type="button" onClick={onCancel} disabled={saving}>
                {t("cancel")}
              </Button>
            </div>
            {error && (
              <p id={errorId} role="alert" className="mt-1.5 text-caption text-destructive">
                {error}
              </p>
            )}
          </form>
        ) : (
          <div className="flex items-center justify-between gap-x-6">
            <span className="min-w-0 break-words text-body text-foreground">{value}</span>
            <Button ref={update} variant="link" size="sm" type="button" onClick={onEdit} aria-describedby={labelId} className="h-auto px-0">
              {t("update")}
            </Button>
          </div>
        )}
      </dd>
    </div>
  )
}
