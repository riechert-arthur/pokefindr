
'use client'

import React, { useEffect, useState } from 'react'
import axios from 'axios'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/Dialog'
import {
  Form,
  FormField,
  FormControl,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/Form'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Avatar from '@/components/ui/Avatar'
import { useSidebar } from '@/components/providers/SidebarContextProvider'
import { RecentReviewsSection, Review } from '@/components/RecentReviewSection'
import { reviewSchema, type ReviewFormValues } from '@/components/map/LocationInfoPanel'
import { StarRating } from '@/components/ui/StarRating'
import { useSessionContext } from '@/components/providers/SessionProvider'
import { LoadSpinner } from '@/components/wrappers/LoadSpinner'
import { Bars3Icon } from '@heroicons/react/24/outline'

export default function ReviewsPage() {
  const { isSidebarOpen } = useSidebar()
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [current, setCurrent] = useState<Review | null>(null)
  const { session, isLoading } = useSessionContext()
  const { toggleSidebar } = useSidebar()

  const form = useForm<ReviewFormValues>({
    resolver: zodResolver(reviewSchema),
    defaultValues: { rating: 0, text: '' },
  })

  useEffect(() => {
    ;(async () => {
      try {
        const res = await axios.get<{ reviews: Review[] }>('/api/my-reviews', {
          withCredentials: true,
        })
        setReviews(res.data.reviews)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    })()
  }, [session])

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this review?')) return
    try {
      await axios.delete(`/api/reviews/${id}`, { withCredentials: true })
      setReviews((rs) => rs.filter((r) => r.id !== id))
    } catch (err) {
      console.error(err)
    }
  }

  const handleEdit = (review: Review) => {
    setCurrent(review)
    form.reset({ rating: review.rating, text: review.comment })
    setEditOpen(true)
  }

  const saveEdit = form.handleSubmit(async (values) => {
    if (!current) return
    try {
      await axios.patch(
        `/api/reviews/${current.id}`,
        { text: values.text, rating: values.rating },
        { withCredentials: true }
      )
      setReviews((rs) =>
        rs.map((r) =>
          r.id === current.id
            ? { ...r, comment: values.text, rating: values.rating }
            : r
        )
      )
      setEditOpen(false)
    } catch (err) {
      console.error(err)
    }
  })

  if (isLoading && !session) {
    return <LoadSpinner text="Loading profile.." />
  }

  return (
    <div className={`${isSidebarOpen ? 'ml-16' : ''} md:ml-16`}>
      {/* header */}
      <header className="absolute inset-x-0 top-0 z-40 flex h-16 border-b border-gray-900/10">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <button onClick={toggleSidebar} className="md:hidden mr-2 p-1 rounded" aria-label="Toggle menu">
            <Bars3Icon className="w-6 h-6 text-gray-600 hover:text-blue-600" />
          </button>
          <div />
          <div className="flex items-center gap-x-8">
            {/*<button className="-m-2.5 p-2.5 text-gray-400 hover:text-gray-500">
              <span className="sr-only">View notifications</span>
              <BellIcon className="h-6 w-6" />
            </button>*/}
            <Avatar userName={session?.username ?? "Guest"} size={40}  />
          </div>
        </div>
      </header>

      <main>
        <div className="space-y-16 py-16 xl:space-y-20">
          <div className="pt-8 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            {loading ? (
              <div className="text-sm text-gray-500">
                <LoadSpinner text="Loading your reviews…"/>
              </div>
            ) : reviews.length === 0 ? (
              <p className="text-sm text-gray-500">You haven’t written any reviews yet.</p>
            ) : (
              <RecentReviewsSection
                reviews={reviews}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            )}
          </div>
        </div>
      </main>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Review</DialogTitle>
            <DialogDescription>Update your rating and comment below.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={saveEdit} className="space-y-4">
              <FormField
                control={form.control}
                name="rating"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rating</FormLabel>
                    <FormControl>
                      <StarRating rating={field.value} starSize={24} onChange={field.onChange} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="text"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Comment</FormLabel>
                    <FormControl>
                      <textarea
                        rows={4}
                        {...field}
                        className="w-full rounded border p-2"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end space-x-2 pt-4">
                <button
                  type="button"
                  onClick={() => setEditOpen(false)}
                  className="px-3 py-1 text-sm font-medium text-gray-600 hover:text-gray-800"
                >Cancel</button>
                <button
                  type="submit"
                  className="px-3 py-1 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded"
                >Save</button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

