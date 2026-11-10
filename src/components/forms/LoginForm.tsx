"use client"

import { Link, useRouter } from "@/i18n/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Form,
  FormField,
  FormControl,
  FormItem,
  FormMessage,
  FormLabel,
} from "@/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod/v3"
import { useForm } from "react-hook-form"
import { handleSubmitError } from "@/lib/forms"
import { LoadingButton } from "@/components/wrappers/LoadingButton"
import type { AuthSchemas } from "@/lib/schemas"
import { useTranslations } from "next-intl"
import { useAuthSchemas } from "./useAuthSchemas"
import { Terms } from "./Terms"
import axios from "axios"
import { toast } from "sonner"
import { broadcastAuth } from "@/lib/auth/broadcast"
import type { OAuthProvider } from "@/lib/auth/providers"
import { OAuthButtons } from "./OAuthButtons"

/** A message to show above the form: why the visitor landed on /login. */
export type LoginNotice = "verified" | "link-expired" | "oauth-failed" | "connect-app"

const NOTICES = {
  verified: { key: "verified", tone: "ok" },
  "link-expired": { key: "linkExpired", tone: "warn" },
  "oauth-failed": { key: "oauthFailed", tone: "warn" },
  "connect-app": { key: "connectApp", tone: "ok" },
} as const satisfies Record<LoginNotice, { key: string; tone: "ok" | "warn" }>

type LoginValues = z.infer<AuthSchemas["loginSchema"]>

export function LoginForm({
  className,
  notice = null,
  providers = [],
  next = null,
  ...props
}: React.ComponentProps<"div"> & {
  notice?: LoginNotice | null
  providers?: readonly OAuthProvider[]
  /** Where to go once logged in: an MCP client's authorization (#134). */
  next?: string | null
}) {
  const router = useRouter()
  const t = useTranslations("auth")
  const { loginSchema } = useAuthSchemas()

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  })

  async function onSubmit(values: LoginValues) {
    try {
      await axios.post("/api/auth/login", values, { withCredentials: true })
      toast.success(t("login.success"))
      broadcastAuth("login")
      // An API route, not a page: a full navigation, so its redirects reach the app that asked.
      if (next) return window.location.assign(next)
      router.refresh()
      router.push("/")
    } catch (err: unknown) {
      handleSubmitError(err)
    } finally {
      form.reset()
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">{t("login.title")}</CardTitle>
          <CardDescription>
            {providers.length ? t("login.descriptionWithProviders") : t("login.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {notice && (
            <p
              role="status"
              className={cn(
                "mb-6 rounded-md border px-3 py-2 text-sm",
                NOTICES[notice].tone === "ok" ? "border-success/40 bg-success/10 text-foreground" : "border-warning/40 bg-warning/10 text-foreground",
              )}
            >
              {t(`login.notices.${NOTICES[notice].key}`)}
            </p>
          )}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <div className="grid gap-6">
                <OAuthButtons providers={providers} next={next} />
                <div className="grid gap-6">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <div className="grid gap-3">
                          <FormLabel>{t("fields.email")}</FormLabel>
                          <FormControl>
                            <Input placeholder={t("fields.emailPlaceholder")} {...field} />
                          </FormControl>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <div className="grid gap-3">
                          <div className="flex items-center">
                            <FormLabel>{t("fields.password")}</FormLabel>
                            <Link href="/forgot-password" className="ml-auto text-sm underline-offset-4 hover:underline">
                              {t("login.forgot")}
                            </Link>
                          </div>
                          <FormControl>
                            <Input type="password" {...field} />
                          </FormControl>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {!form.formState.isSubmitting && (
                    <Button type="submit" className="w-full">
                      {t("login.submit")}
                    </Button>
                  )}
                  {form.formState.isSubmitting && (
                    <LoadingButton className="w-full">
                      {t("login.submitting")}
                    </LoadingButton>
                  )}
                </div>
                <div className="text-center text-sm">
                  {t.rich("login.noAccount", {
                    link: (chunks) => (
                      <Link href="/signup" className="underline underline-offset-4">
                        {chunks}
                      </Link>
                    ),
                  })}
                </div>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
      <Terms />
    </div>
  )
}
