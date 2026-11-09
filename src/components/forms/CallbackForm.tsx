"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Form,
  FormField,
  FormControl,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import axios from "axios"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { callbackSchema } from "@/lib/schemas"
import { z } from "zod"
import { broadcastAuth } from "@/lib/auth/broadcast"
import { handleSubmitError } from "@/lib/forms"
import { Input } from "@/components/ui/input"

export function CallbackForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter()
  const form = useForm<z.infer<typeof callbackSchema>>({
    resolver: zodResolver(callbackSchema),
    defaultValues: { username: "" },
  })

  async function onSubmit(values: z.infer<typeof callbackSchema>) {
    try {
      await axios.post("/api/auth/onboarding", { username: values.username }, { withCredentials: true })
      broadcastAuth("login")
      toast.success("Welcome aboard!")
      router.push("/home")
    } catch (err: unknown) {
      handleSubmitError(err)
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle>Almost done…</CardTitle>
          <CardDescription>
            Pick a username. It&apos;s what others see on your reviews.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <FormControl>
                      <Input placeholder="your-handle" autoComplete="username" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="mt-4 w-full"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting
                  ? "Finishing up…"
                  : "Finish signing in"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
