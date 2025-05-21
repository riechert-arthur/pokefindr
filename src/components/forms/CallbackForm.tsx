"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/Button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card"
import {
  Form,
  FormField,
  FormControl,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/Form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import axios from "axios"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { callbackSchema } from "@/lib/schemas"
import { z } from "zod"

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
      const hash = window.location.hash.substring(1)
      const params = new URLSearchParams(hash)
      const accessToken = params.get("access_token")
      if (!accessToken) throw new Error("No access token in URL")

      await axios.post(
        "/api/auth/onboarding",
        { access_token: accessToken, username: values.username },
        { withCredentials: true }
      )

      new BroadcastChannel("auth").postMessage("login")
      toast.success("Welcome aboard!")
      router.push("/")
    } catch (err: unknown) {
      console.error(err)
      toast.error("Something went wrong")
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle>Almost done…</CardTitle>
          <CardDescription>
            Pick a unique username to finish signing in
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
                      <input
                        className="w-full rounded border px-3 py-2"
                        placeholder="your-handle"
                        {...field}
                      />
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
                  : "Complete Sign-in"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
