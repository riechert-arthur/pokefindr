"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import axios from "axios"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { LoadingButton } from "@/components/wrappers/LoadingButton"
import { resetPasswordSchema } from "@/lib/schemas"

/** Sets a new password from a reset link's token. Without a valid token, offers a new link. */
export function ResetPasswordForm({ token }: { token: string | null }) {
  const router = useRouter()
  const form = useForm<z.infer<typeof resetPasswordSchema>>({ resolver: zodResolver(resetPasswordSchema), defaultValues: { password: "", passwordVerification: "" } })

  async function onSubmit({ password }: z.infer<typeof resetPasswordSchema>) {
    try {
      await axios.post("/api/identity/reset-password", { newPassword: password, token })
      toast.success("Password changed. Log in with your new one.")
      router.push("/login")
    } catch (err) {
      const expired = axios.isAxiosError(err) && err.response?.status === 400
      toast.error(expired ? "That link has expired or was already used. Ask for a new one." : "Couldn't change your password. Try again.")
    }
  }

  if (!token)
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">That link has expired</CardTitle>
          <CardDescription>Reset links work once, for 1 hour.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Button asChild className="w-full">
            <Link href="/forgot-password">Send a new link</Link>
          </Button>
        </CardContent>
      </Card>
    )

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Choose a new password</CardTitle>
        <CardDescription>You&apos;ll be logged out everywhere else.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-6">
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <div className="grid gap-3">
                    <FormLabel>New password</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="new-password" {...field} />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="passwordVerification"
              render={({ field }) => (
                <FormItem>
                  <div className="grid gap-3">
                    <FormLabel>Repeat it</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="new-password" {...field} />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            {form.formState.isSubmitting ? (
              <LoadingButton className="w-full">Saving...</LoadingButton>
            ) : (
              <Button type="submit" className="w-full">
                Change password
              </Button>
            )}
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
