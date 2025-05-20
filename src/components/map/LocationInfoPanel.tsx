
import React, { FC, useState, useEffect, useCallback, Fragment } from "react"
import axios from "axios"
import { PencilSquareIcon, XMarkIcon } from "@heroicons/react/24/outline"
import { LocationPopupProps } from "./LocationPinPopUps"
import { StarRating } from "@/components/ui/StarRating"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/Dialog"
import {
  Form,
  FormField,
  FormControl,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/Form"
import { Button } from "@/components/ui/Button"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import machineData from "@/data/vending_machines.json"
import { handleSubmitError } from "@/lib/forms"
import { useSessionContext } from "@/components/providers/SessionProvider"
import { useRouter } from "next/navigation"

interface InfoPanelProps {
  info: Omit<LocationPopupProps, "onClose"> | null
  onClose: () => void
}

interface Review {
  rating: number
  text: string
  username: string
}

export const reviewSchema = z.object({
  rating: z.number().min(1, { message: "Select a rating" }).max(5),
  text: z.string().min(1, { message: "Please write a review" }),
})
export type ReviewFormValues = z.infer<typeof reviewSchema>

const PLACEHOLDER_URL = "/placeholder.png"

export const LocationInfoPanel: FC<InfoPanelProps> = ({ info, onClose }) => {
  const [reviews, setReviews] = useState<Review[]>([])
  const [showAllReviews, setShowAllReviews] = useState(false)
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  const { session, isLoading } = useSessionContext()
  const router = useRouter()

  const reviewForm = useForm<ReviewFormValues>({
    resolver: zodResolver(reviewSchema),
    defaultValues: { rating: 1, text: "" },
  })

  const loadReviews = useCallback(
    async (lat: number, lng: number) => {
      try {
        const res = await axios.get<{ reviews: Review[] }>("/api/reviews", {
          params: { lat, lng },
          withCredentials: true,
        })
        setReviews(res.data.reviews || [])
      } catch (err) {
        console.error("Failed to load reviews", err)
      }
    },
    []
  )

  useEffect(() => {
    if (!info) return
    const [longitude, latitude] =
      machineData.features[info.feature_index].geometry.coordinates
    loadReviews(latitude, longitude)
  }, [info, loadReviews])

  const onReviewSubmit = async (values: ReviewFormValues) => {
    if (!info) return

    try {
      const [longitude, latitude] =
        machineData.features[info.feature_index].geometry.coordinates

      await axios.post(
        "/api/reviews",
        {
          lat: latitude,
          lng: longitude,
          rating: values.rating,
          text: values.text,
        },
        { withCredentials: true }
      )

      reviewForm.reset()
      await loadReviews(latitude, longitude)
    } catch (err) {
      handleSubmitError(err)
    }
  }

  const displayedReviews = showAllReviews ? reviews : reviews.slice(0, 3)
  const average =
    reviews.length === 0
      ? 0
      : reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length

  return (
    <>
      {/* Mobile panel */}
      <div
        className={`fixed bottom-0 left-0 w-full h-1/2 bg-white shadow-xl transform transition-transform duration-300 ease-in-out md:hidden z-[900] flex flex-col ${
          info ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex-shrink-0 flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Location Details</h2>
          <button onClick={onClose} aria-label="Close panel">
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {info && (
          <div className="p-4 space-y-2 flex-1 overflow-y-auto">
            <p>
              <strong>Retailer:</strong> {info.retailer}
            </p>
            <p>
              <strong>Address:</strong> {info.address}
            </p>
            <p>
              <strong>City:</strong> {info.city}, <strong>State:</strong>{" "}
              {info.state}
            </p>
            <p>
              <strong>Machine ID:</strong> {info.machineID}
            </p>

            <div className="mt-6 border-t pt-4">
              <h3 className="mb-2 text-lg font-semibold">Review Summary</h3>
              <div className="flex flex-col items-center">
                <StarRating rating={average} starSize={16} />
                <span className="font-semibold mt-1 text-blue-500">
                  {reviews.length} reviews
                </span>

                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      className="mt-4 flex items-center rounded-full border border-gray-400 py-1 px-3 font-medium text-gray-700 transition-transform hover:scale-105 hover:text-blue-500 hover:border-blue-500"
                      onClick={() => {
                        if (!isLoading && !session) {
                          router.push("/login")
                        }
                      }}
                    >
                      <PencilSquareIcon className="w-6 h-6 mr-2" />
                      Write a review
                    </Button>
                  </DialogTrigger>

                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add your review</DialogTitle>
                      <DialogDescription>
                        Share your experience with this location
                      </DialogDescription>
                    </DialogHeader>

                    <Form {...reviewForm}>
                      <form
                        onSubmit={reviewForm.handleSubmit(onReviewSubmit)}
                        className="space-y-4"
                      >
                        <FormField
                          control={reviewForm.control}
                          name="rating"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Rating</FormLabel>
                              <StarRating
                                rating={field.value}
                                starSize={24}
                                onChange={field.onChange}
                              />
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={reviewForm.control}
                          name="text"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Review</FormLabel>
                              <FormControl>
                                <textarea
                                  rows={4}
                                  className="w-full rounded-md border p-2"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="flex justify-end">
                          <Button type="submit">Submit</Button>
                        </div>
                      </form>
                    </Form>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <div className="mt-4 border-t pt-4 space-y-3">
              <h3 className="text-lg font-semibold">Reviews</h3>

              {displayedReviews.map((review, idx) => {
                const isExpanded = expanded[idx] || false
                const tooLong = review.text.length > 100
                const text = !tooLong || isExpanded
                  ? review.text
                  : `${review.text.slice(0, 100)}…`

                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        {review.username}
                      </span>
                      <StarRating  rating={review.rating} starSize={16} />
                    </div>
                    <p className="text-sm text-gray-700 break-words">
                      {text}
                      {tooLong && (
                        <button
                          onClick={() =>
                            setExpanded((prev) => ({
                              ...prev,
                              [idx]: !isExpanded,
                            }))
                          }
                          className="ml-2 text-blue-500 text-xs"
                        >
                          {isExpanded ? "Show less" : "Read more"}
                        </button>
                      )}
                    </p>
                  </div>
                )
              })}

              {reviews.length > 3 && (
                <button
                  onClick={() => setShowAllReviews((s) => !s)}
                  className="text-blue-600 text-sm"
                >
                  {showAllReviews
                    ? "Show fewer reviews"
                    : `View all ${reviews.length} reviews`}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Desktop panel */}
      <div
        className={`fixed top-0 left-[60px] w-96 h-full bg-white shadow-xl transform transition-transform duration-300 ease-in-out hidden md:flex flex-col ${
          info ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ zIndex: 90 }}
      >
        <img
          src={PLACEHOLDER_URL}
          alt="No image available"
          className="h-48 w-full object-cover"
        />

        {info && (
          <>
            <div className="flex items-center justify-between px-4 py-4 border-b">
              <h2 className="text-xl font-semibold">Location Details</h2>
            </div>

            <div className="p-6 space-y-2 overflow-y-auto flex-1">
              <h3 className="text-xl font-medium">{info.retailer}</h3>
              <p className="text-sm text-gray-600">{info.address}</p>
              <p className="text-sm text-gray-600">
                {info.city}, {info.state}
              </p>
              <p className="text-sm font-medium text-gray-700">
                Machine ID: {info.machineID}
              </p>

              <div className="mt-6 border-t pt-4">
                <h3 className="text-lg font-semibold">Review Summary</h3>
                <div className="flex flex-col items-center">
                  <StarRating rating={average} starSize={16} />
                  <span className="font-semibold mt-1 text-blue-500">
                    {reviews.length} reviews
                  </span>

                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        className="mt-4 flex items-center rounded-full border border-gray-400 py-1 px-3 font-medium text-gray-700 transition-transform hover:scale-105 hover:text-blue-500 hover:border-blue-500"
                      >
                        <PencilSquareIcon className="w-6 h-6 mr-2" />
                        Write a review
                      </Button>
                    </DialogTrigger>

                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add your review</DialogTitle>
                        <DialogDescription>
                          Share your experience with this location
                        </DialogDescription>
                      </DialogHeader>

                      <Form {...reviewForm}>
                        <form
                          onSubmit={reviewForm.handleSubmit(onReviewSubmit)}
                          className="space-y-4"
                        >
                          <FormField
                            control={reviewForm.control}
                            name="rating"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Rating</FormLabel>
                                <StarRating
                                  rating={field.value}
                                  starSize={24}
                                  onChange={field.onChange}
                                />
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={reviewForm.control}
                            name="text"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Review</FormLabel>
                                <FormControl>
                                  <textarea
                                    rows={4}
                                    className="w-full rounded-md border p-2"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <div className="flex justify-end">
                            <Button type="submit">Submit</Button>
                          </div>
                        </form>
                      </Form>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

              <div className="mt-6 border-t pt-4 space-y-4">
                <h3 className="text-lg font-semibold">Reviews</h3>

                {displayedReviews.map((review, idx) => {
                  const isExpanded = expanded[idx] || false
                  const tooLong = review.text.length > 100
                  const text = !tooLong || isExpanded
                    ? review.text
                    : `${review.text.slice(0, 100)}…`

                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          {review.username}
                        </span>
                        <StarRating rating={review.rating} starSize={16} />
                      </div>
                      <p className="text-sm text-gray-700 break-words">
                        {text}
                        {tooLong && (
                          <button
                            onClick={() =>
                              setExpanded((prev) => ({
                                ...prev,
                                [idx]: !isExpanded,
                              }))
                            }
                            className="ml-2 text-blue-500 text-xs"
                          >
                            {isExpanded ? "Show less" : "Read more"}
                          </button>
                        )}
                      </p>
                    </div>
                  )
                })}

                {reviews.length > 3 && (
                  <button
                    onClick={() => setShowAllReviews((s) => !s)}
                    className="text-blue-600 text-sm"
                  >
                    {showAllReviews
                      ? "Show fewer reviews"
                      : `View all ${reviews.length} reviews`}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}

