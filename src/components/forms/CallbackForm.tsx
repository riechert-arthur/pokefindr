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
import { useRouter } from "@/i18n/navigation"
import type { AuthSchemas } from "@/lib/schemas"
import { useTranslations } from "next-intl"
import { useAuthSchemas } from "./useAuthSchemas"

type CallbackValues = z.infer<AuthSchemas["callbackSchema"]>
import { z } from "zod/v3"
import { broadcastAuth } from "@/lib/auth/broadcast"
import { useSubmitError } from "@/lib/forms"
import { Input } from "@/components/ui/input"

export function CallbackForm({
  className,
  next = null,
  ...props
}: React.ComponentProps<"div"> & { next?: string | null }) {
  const handleSubmitError = useSubmitError()
  const router = useRouter()
  const t = useTranslations("auth")
  const { callbackSchema } = useAuthSchemas()
  const form = useForm<CallbackValues>({
    resolver: zodResolver(callbackSchema),
    defaultValues: { username: "" },
  })

  async function onSubmit(values: CallbackValues) {
    try {
      await axios.post("/api/auth/onboarding", { username: values.username }, { withCredentials: true })
      broadcastAuth("login")
      toast.success(t("callback.welcome"))
      if (next) window.location.assign(next)
      else router.push("/home")
    } catch (err: unknown) {
      handleSubmitError(err)
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle>{t("callback.title")}</CardTitle>
          <CardDescription>
            {t("callback.description")}
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
                    <FormLabel>{t("fields.username")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("callback.usernamePlaceholder")} autoComplete="username" {...field} />
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
                {form.formState.isSubmitting ? t("callback.submitting") : t("callback.submit")}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
