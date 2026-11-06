
import React from 'react'
import { SquarePenIcon, Trash2Icon } from "lucide-react"
import { StarRating } from '@/components/ui/StarRating'

export interface Review {
  id: string
  rating: number
  comment: string
  location: {
    name: string
    address: string
  }
  images: string[]
  user: {
    imageUrl: string
  }
}

interface RecentReviewsSectionProps {
  reviews: Review[]
  onEdit: (review: Review) => void
  onDelete: (id: string) => void
}

export const RecentReviewsSection: React.FC<RecentReviewsSectionProps> = ({ reviews, onEdit, onDelete }) => {
  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base/7 font-semibold text-foreground">Your Recent Reviews</h2>
      </div>
      <div className="overflow-x-auto py-4">
        <ul role="list" className="flex space-x-6">
          {reviews.map((review) => (
            <li
              key={review.id}
              className="shadow-md flex-shrink-0 flex flex-col w-80 h-96 justify-between overflow-hidden bg-card rounded-xl border border-border"
            >
              <div className="flex items-center gap-x-4 border-b border-border  p-4">
                <div className="flex-1">
                  <div className="text-sm/6 font-medium text-foreground">{review.location.name}</div>
                  <div className="text-xs text-muted-foreground">{review.location.address}</div>
                </div>
                <StarRating rating={review.rating} starSize={20} />
              </div>

              <div className="px-4 py-3 flex-1 overflow-y-auto">
                <p className="text-sm text-foreground">{review.comment}</p>
                {/* Images could go here */}
              </div>

              <div className="flex items-center justify-end gap-x-2 border-t border-border  p-4">
                <button
                  onClick={() => onEdit(review)}
                  className="flex items-center mr-1 text-sm font-semibold text-primary hover:text-primary/80"
                >
                  <SquarePenIcon className="mr-1 size-6" /> Edit
                </button>
                <button
                  onClick={() => onDelete(review.id)}
                  className="flex items-center text-sm font-semibold text-destructive hover:text-destructive"
                >
                  <Trash2Icon className="size-6 mr-1" /> Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

