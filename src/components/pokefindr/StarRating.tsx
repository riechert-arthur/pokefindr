"use client"

import React, { useRef } from "react"
import { Star, StarHalf } from "lucide-react"
import { cn } from "@/lib/utils"

interface StarRatingProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  /** 0–5; halves are shown. */
  rating: number
  starSize?: number
  /** Makes the stars a 1–5 radio group. Without it the rating is read-only. */
  onChange?: (newRating: number) => void
  /** Accessible name for the input, e.g. "Your rating". */
  label?: string
}

type Fill = "full" | "half" | "empty"

/** Rounds to the nearest half star: 4.33 → 4.5, 4.2 → 4, 4.96 → 5. */
const toHalf = (rating: number) => Math.round(rating * 2) / 2

const fillFor = (rating: number, star: number): Fill =>
  rating >= star ? "full" : rating >= star - 0.5 ? "half" : "empty"

/**
 * One star: filled in the spark token, empty in the border token. lucide's
 * StarHalf is only the left half, so a half star lays it over an empty outline.
 */
const StarIcon = ({ fill, size }: { fill: Fill; size: number }) => (
  <span className="relative block" style={{ width: size, height: size }}>
    <Star
      size={size}
      fill={fill === "full" ? "currentColor" : "none"}
      className={cn("absolute inset-0", fill === "full" ? "text-spark" : "text-border")}
    />
    {fill === "half" && <StarHalf size={size} fill="currentColor" className="absolute inset-0 text-spark" />}
  </span>
)

/**
 * Five stars. Read-only, it's an image labelled "N out of 5 stars". With
 * onChange it's a radio group (arrow keys, Home and End move and select).
 * Extra props such as id and aria-describedby, which FormControl passes, go on
 * the wrapper.
 */
export function StarRating({ rating, starSize = 24, onChange, label = "Rating", className, ...rest }: StarRatingProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const wrapper = cn("flex gap-0.5", className)

  if (!onChange) {
    return (
      // Drawn and read at the same half-star step, so an average like 4.33
      // shows and reads as "4.5 out of 5 stars".
      <div role="img" aria-label={`${toHalf(rating)} out of 5 stars`} className={wrapper} {...rest}>
        {[1, 2, 3, 4, 5].map((star) => (
          <StarIcon key={star} fill={fillFor(toHalf(rating), star)} size={starSize} />
        ))}
      </div>
    )
  }

  const selected = Math.round(rating)
  const select = (value: number) => {
    const next = Math.min(5, Math.max(1, value))
    onChange(next)
    refs.current[next - 1]?.focus()
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key]
    if (step) {
      e.preventDefault()
      select((selected || 0) + step)
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault()
      select(e.key === "Home" ? 1 : 5)
    }
  }

  return (
    <div role="radiogroup" aria-label={label} className={wrapper} onKeyDown={onKeyDown} {...rest}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          ref={(el) => {
            refs.current[star - 1] = el
          }}
          type="button"
          role="radio"
          aria-checked={selected === star}
          aria-label={`${star} ${star === 1 ? "star" : "stars"}`}
          // Roving tabindex: one tab stop, on the selected star (or the first).
          tabIndex={selected === star || (selected < 1 && star === 1) ? 0 : -1}
          onClick={() => select(star)}
          className="rounded-md p-0.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <StarIcon fill={fillFor(rating, star)} size={starSize} />
        </button>
      ))}
    </div>
  )
}
