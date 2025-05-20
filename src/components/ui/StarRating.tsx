
import React from 'react'
import { StarIcon as SolidStarIcon } from '@heroicons/react/20/solid'
import { StarIcon as OutlineStarIcon } from '@heroicons/react/24/outline'
import { StarHalf } from 'lucide-react'

interface StarRatingProps {
  rating: number
  starSize?: number
  onChange?: (newRating: number) => void
}

export const StarRating: React.FC<StarRatingProps> = ({ rating, starSize = 24, onChange }) => {
  const stars = Array.from({ length: 5 }, (_, i) => {
    const threshold = i + 1
    let StarComponent: React.ReactNode
    if (rating >= threshold) {
      StarComponent = (
        <SolidStarIcon
          width={starSize}
          height={starSize}
          className="text-yellow-500"
        />
      )
    } else if (rating >= threshold - 0.5) {
      StarComponent = (
        <StarHalf
          size={starSize}
          className="text-yellow-500"
        />
      )
    } else {
      StarComponent = (
        <OutlineStarIcon
          width={starSize}
          height={starSize}
          className="text-yellow-500"
        />
      )
    }

    if (onChange) {
      return (
        <button
          key={i}
          type="button"
          onClick={() => onChange(threshold)}
          className="focus:outline-none"
        >
          {StarComponent}
        </button>
      )
    }

    return <span key={i}>{StarComponent}</span>
  })

  return <div className="flex space-x-1">{stars}</div>
}

