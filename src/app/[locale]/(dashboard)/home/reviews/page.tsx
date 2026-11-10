
'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { MenuIcon } from "lucide-react"
import axios from 'axios'
import { useTranslations } from 'next-intl'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Form,
  FormField,
  FormControl,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { UserMenu } from "@/components/pokefindr/UserMenu"
import { useSidebar } from '@/components/providers/SidebarContextProvider'
import { APP_NAV_ID } from '@/components/pokefindr/AppRail'
import { RecentReviewsSection, Review } from '@/components/RecentReviewSection'
import { z } from 'zod/v3'
import { StarRating } from '@/components/pokefindr/StarRating'
import { useSessionContext } from '@/components/providers/SessionProvider'
import { LoadSpinner } from '@/components/wrappers/LoadSpinner'

type ReviewMessages = ReturnType<typeof useTranslations<'dashboard.reviews'>>

/** The edit form's checks, with their messages in the page's language. */
const makeReviewSchema = (t: ReviewMessages) =>
  z.object({
    rating: z.number().min(1, { message: t('validation.rating') }).max(5, { message: t('validation.rating') }),
    text: z.string().min(1, { message: t('validation.text') }),
  })

type ReviewFormValues = z.infer<ReturnType<typeof makeReviewSchema>>

export default function ReviewsPage() {
  const t = useTranslations('dashboard.reviews')
  const reviewSchema = useMemo(() => makeReviewSchema(t), [t])
  const tDashboard = useTranslations('dashboard')
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
    if (!confirm(t('deleteConfirm'))) return
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
      const res = await axios.patch<{ status?: Review['status'] }>(
        `/api/reviews/${current.id}`,
        { text: values.text, rating: values.rating },
        { withCredentials: true }
      )
      setReviews((rs) =>
        rs.map((r) =>
          r.id === current.id
            ? { ...r, comment: values.text, rating: values.rating, status: res.data?.status ?? r.status }
            : r
        )
      )
      setEditOpen(false)
    } catch (err) {
      console.error(err)
    }
  })

  if (isLoading && !session) {
    return <LoadSpinner text={t("loadingProfile")} fullScreen={false} />
  }

  return (
    <div className={isSidebarOpen ? 'max-sm:ml-16' : undefined}>
      {/* header */}
      <header className="absolute inset-x-0 top-0 z-40 flex h-16 border-b border-border">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <button onClick={toggleSidebar} className="sm:hidden mr-2 p-1 rounded" aria-label={tDashboard("openNav")} aria-controls={APP_NAV_ID} aria-expanded={isSidebarOpen}>
            <MenuIcon className="size-6 text-muted-foreground hover:text-primary/80" />
          </button>
          <div />
          <div className="flex items-center gap-x-8">
            {/*<button className="-m-2.5 p-2.5 text-muted-foreground hover:text-foreground">
              <span className="sr-only">View notifications</span>
              <BellIcon className="size-6" />
            </button>*/}
            <UserMenu userName={session?.username ?? tDashboard("guest")} size={40}  />
          </div>
        </div>
      </header>

      <main>
        <div className="space-y-16 py-16 xl:space-y-20">
          <div className="pt-8 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            {loading ? (
              <div className="text-sm text-muted-foreground">
                <LoadSpinner text={t("loading")} fullScreen={false} />
              </div>
            ) : reviews.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("empty")}</p>
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
            <DialogTitle>{t("edit.title")}</DialogTitle>
            <DialogDescription>{t("edit.description")}</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={saveEdit} className="space-y-4">
              <FormField
                control={form.control}
                name="rating"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("edit.rating")}</FormLabel>
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
                    <FormLabel>{t("edit.comment")}</FormLabel>
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
                  className="px-3 py-1 text-sm font-medium text-muted-foreground hover:text-foreground"
                >{t("edit.cancel")}</button>
                <button
                  type="submit"
                  className="px-3 py-1 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded"
                >{t("edit.save")}</button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

