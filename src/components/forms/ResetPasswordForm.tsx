"use client"

import { Link, useRouter } from "@/i18n/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod/v3"
import axios from "axios"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { LoadingButton } from "@/components/wrappers/LoadingButton"
import type { AuthSchemas } from "@/lib/schemas"
import { useTranslations } from "next-intl"
import { useAuthSchemas } from "./useAuthSchemas"

type ResetPasswordValues = z.infer<AuthSchemas["resetPasswordSchema"]>

/** Sets a new password from a reset link's token. Without a valid token, offers a new link. */
export function ResetPasswordForm({ token }: { token: string | null }) {
  const router = useRouter()
  const t = useTranslations("auth.resetPassword")
  const { resetPasswordSchema } = useAuthSchemas()
  const form = useForm<ResetPasswordValues>({ resolver: zodResolver(resetPasswordSchema), defaultValues: { password: "", passwordVerification: "" } })

  async function onSubmit({ password }: ResetPasswordValues) {
    try {
      await axios.post("/api/identity/reset-password", { newPassword: password, token })
      toast.success(t("success"))
      router.push("/login")
    } catch (err) {
      const expired = axios.isAxiosError(err) && err.response?.status === 400
      toast.error(expired ? t("expired") : t("failed"))
    }
  }

  if (!token)
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">{t("expiredTitle")}</CardTitle>
          <CardDescription>{t("expiredDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Button asChild className="w-full">
            <Link href="/forgot-password">{t("newLink")}</Link>
          </Button>
        </CardContent>
      </Card>
    )

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
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
                    <FormLabel>{t("password")}</FormLabel>
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
                    <FormLabel>{t("repeat")}</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="new-password" {...field} />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            {form.formState.isSubmitting ? (
              <LoadingButton className="w-full">{t("submitting")}</LoadingButton>
            ) : (
              <Button type="submit" className="w-full">
                {t("submit")}
              </Button>
            )}
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
