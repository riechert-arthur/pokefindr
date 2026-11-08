"use client"

import { useLayoutEffect, useRef, type FormEvent, type KeyboardEvent, type ReactNode } from "react"
import { ArrowUpIcon, SquareIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/** The textarea grows with its text up to this height, then scrolls. */
const MAX_HEIGHT = 160

interface ComposerProps {
  value: string
  onChange: (value: string) => void
  onSubmit: (text: string) => void
  /** An answer is streaming: the send button becomes Stop. */
  busy?: boolean
  onStop?: () => void
  /** Shown over the empty field (the typing placeholder). */
  placeholder?: ReactNode
  onFocusChange?: (focused: boolean) => void
  disabled?: boolean
  className?: string
}

/**
 * The prototype's composer: a rounded card with a growing textarea and a
 * round send button (Stop while answering). Enter sends, Shift+Enter adds a
 * line.
 */
export function Composer({ value, onChange, onSubmit, busy = false, onStop, placeholder, onFocusChange, disabled, className }: ComposerProps) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const t = ref.current
    if (!t) return
    t.style.height = "auto"
    t.style.height = `${Math.min(t.scrollHeight, MAX_HEIGHT)}px`
  }, [value])

  const send = () => {
    const text = value.trim()
    if (!text || busy || disabled) return
    onSubmit(text)
  }
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    send()
  }
  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      send()
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "flex items-end gap-2 rounded-[20px] border border-border bg-card py-2.5 pl-[18px] pr-2.5 shadow-[0_1px_2px_hsl(var(--foreground)/0.05),0_18px_50px_-12px_hsl(var(--brand-2)/0.3)] transition-colors focus-within:border-ring",
        className,
      )}
    >
      <div className="relative min-w-0 flex-1">
        <textarea
          ref={ref}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKey}
          onFocus={() => onFocusChange?.(true)}
          onBlur={() => onFocusChange?.(false)}
          disabled={disabled}
          aria-label="Message the assistant"
          maxLength={2000}
          className="block max-h-40 min-h-12 w-full resize-none border-0 bg-transparent py-2.5 text-[16px] leading-[1.45] text-foreground outline-none sm:text-[17px]"
        />
        {!value && placeholder && (
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden whitespace-nowrap py-2.5 text-[16px] leading-[1.45] text-muted-foreground sm:text-[17px]">
            {placeholder}
          </div>
        )}
      </div>
      {busy ? (
        <button type="button" onClick={onStop} aria-label="Stop" className={sendClass}>
          <SquareIcon className="size-[14px] fill-current stroke-none" aria-hidden />
        </button>
      ) : (
        <button type="submit" aria-label="Send" disabled={disabled || !value.trim()} className={sendClass}>
          <ArrowUpIcon className="size-[18px]" aria-hidden />
        </button>
      )}
    </form>
  )
}

const sendClass =
  "mb-1 grid size-10 flex-none place-items-center rounded-full bg-foreground text-background hover:brightness-[1.15] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
