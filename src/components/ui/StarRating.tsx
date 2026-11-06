import React, { useRef } from 'react'
import { Star, StarHalf } from 'lucide-react'

interface StarRatingProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  rating: number
  starSize?: number
  /** Makes the stars a 1–5 radio group. Without it the rating is read-only. */
  onChange?: (newRating: number) => void
}

type Fill = 'full' | 'half' | 'empty'

const fillFor = (rating: number, threshold: number): Fill =>
  rating >= threshold ? 'full' : rating >= threshold - 0.5 ? 'half' : 'empty'

/** One star at a fill level. lucide's StarHalf is only the left half, so a half star lays it over an outline. */
const StarIcon = ({ fill, size }: { fill: Fill; size: number }) => (
  <span className="relative block" style={{ width: size, height: size }}>
    <Star size={size} fill={fill === 'full' ? 'currentColor' : 'none'} className="absolute inset-0" />
    {fill === 'half' && <StarHalf size={size} fill="currentColor" className="absolute inset-0" />}
  </span>
)

/**
 * Five stars. Read-only, it's an image labelled "N out of 5 stars". With
 * onChange it's a radio group (arrow keys move and select). Extra props such
 * as id and aria-describedby, which FormControl passes, go on the wrapper.
 */
export const StarRating: React.FC<StarRatingProps> = ({ rating, starSize = 24, onChange, className, ...rest }) => {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const wrapper = `flex space-x-1 text-yellow-500 ${className ?? ''}`.trim()

  if (!onChange) {
    return (
      <div role="img" aria-label={`${rating} out of 5 stars`} className={wrapper} {...rest}>
        {[1, 2, 3, 4, 5].map((t) => <StarIcon key={t} fill={fillFor(rating, t)} size={starSize} />)}
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
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      select(e.key === 'Home' ? 1 : 5)
    }
  }

  return (
    <div role="radiogroup" aria-label="Rating" className={wrapper} onKeyDown={onKeyDown} {...rest}>
      {[1, 2, 3, 4, 5].map((t) => (
        <button
          key={t}
          ref={(el) => { refs.current[t - 1] = el }}
          type="button"
          role="radio"
          aria-checked={selected === t}
          aria-label={`${t} ${t === 1 ? 'star' : 'stars'}`}
          // Roving tabindex: one tab stop, on the selected star (or the first).
          tabIndex={selected === t || (selected < 1 && t === 1) ? 0 : -1}
          onClick={() => select(t)}
          className="rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <StarIcon fill={fillFor(rating, t)} size={starSize} />
        </button>
      ))}
    </div>
  )
}
