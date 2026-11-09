"use client"

import { useState } from "react"
import { Link } from "@/i18n/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod/v3"
import axios from "axios"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { LoadingButton } from "@/components/wrappers/LoadingButton"
import { handleSubmitError } from "@/lib/forms"
import { forgotPasswordSchema } from "@/lib/schemas"

/** Asks for a password reset link. Says the same whether or not the email has an account. */
export function ForgotPasswordForm() {
  const [sentTo, setSentTo] = useState<string | null>(null)
  const form = useForm<z.infer<typeof forgotPasswordSchema>>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: "" } })

  async function onSubmit({ email }: z.infer<typeof forgotPasswordSchema>) {
    try {
      await axios.post("/api/identity/request-password-reset", { email, redirectTo: "/reset-password" })
      setSentTo(email)
    } catch (err) {
      handleSubmitError(err)
    }
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Reset your password</CardTitle>
        <CardDescription>{sentTo ? "Check your inbox" : "We'll email you a link to choose a new one"}</CardDescription>
      </CardHeader>
      <CardContent>
        {sentTo ? (
          <div className="grid gap-6 text-center text-sm" role="status">
            <p className="text-muted-foreground">
              If <span className="font-medium text-foreground">{sentTo}</span> has a PokeFindr account, a reset link is on its way. It works for 1 hour.
            </p>
            <Link href="/login" className="underline underline-offset-4">
              Back to login
            </Link>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-6">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <div className="grid gap-3">
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" autoComplete="email" placeholder="m@example.com" {...field} />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {form.formState.isSubmitting ? (
                <LoadingButton className="w-full">Sending...</LoadingButton>
              ) : (
                <Button type="submit" className="w-full">
                  Send reset link
                </Button>
              )}
              <div className="text-center text-sm">
                Remembered it?{" "}
                <Link href="/login" className="underline underline-offset-4">
                  Log in
                </Link>
              </div>
            </form>
          </Form>
        )}
      </CardContent>
    </Card>
  )
}
