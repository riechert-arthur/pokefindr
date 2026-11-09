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
import type { AuthSchemas } from "@/lib/schemas"
import { useTranslations } from "next-intl"
import { useAuthSchemas } from "./useAuthSchemas"

type ForgotPasswordValues = z.infer<AuthSchemas["forgotPasswordSchema"]>

/** Asks for a password reset link. Says the same whether or not the email has an account. */
export function ForgotPasswordForm() {
  const t = useTranslations("auth")
  const { forgotPasswordSchema } = useAuthSchemas()
  const [sentTo, setSentTo] = useState<string | null>(null)
  const form = useForm<ForgotPasswordValues>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: "" } })

  async function onSubmit({ email }: ForgotPasswordValues) {
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
        <CardTitle className="text-xl">{t("forgotPassword.title")}</CardTitle>
        <CardDescription>{sentTo ? t("forgotPassword.sentDescription") : t("forgotPassword.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {sentTo ? (
          <div className="grid gap-6 text-center text-sm" role="status">
            <p className="text-muted-foreground">
              {t.rich("forgotPassword.sent", { email: sentTo, b: (chunks) => <span className="font-medium text-foreground">{chunks}</span> })}
            </p>
            <Link href="/login" className="underline underline-offset-4">
              {t("forgotPassword.backToLogin")}
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
                      <FormLabel>{t("fields.email")}</FormLabel>
                      <FormControl>
                        <Input type="email" autoComplete="email" placeholder={t("fields.emailPlaceholder")} {...field} />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {form.formState.isSubmitting ? (
                <LoadingButton className="w-full">{t("forgotPassword.submitting")}</LoadingButton>
              ) : (
                <Button type="submit" className="w-full">
                  {t("forgotPassword.submit")}
                </Button>
              )}
              <div className="text-center text-sm">
                {t.rich("forgotPassword.remembered", {
                  link: (chunks) => (
                    <Link href="/login" className="underline underline-offset-4">
                      {chunks}
                    </Link>
                  ),
                })}
              </div>
            </form>
          </Form>
        )}
      </CardContent>
    </Card>
  )
}
