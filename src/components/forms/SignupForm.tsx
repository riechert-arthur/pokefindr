"use client"

import { cn } from "@/lib/utils"
import { useForm } from "react-hook-form"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Form } from "@/components/ui/form"
import { z } from "zod/v3"
import { zodResolver } from "@hookform/resolvers/zod"
import { useSubmitError } from "@/lib/forms"
import { LoadingButton } from "@/components/wrappers/LoadingButton"
import type { AuthSchemas } from "@/lib/schemas"
import { useTranslations } from "next-intl"
import { AuthField } from "./AuthField"
import { useAuthSchemas } from "./useAuthSchemas"
import { Terms } from "./Terms"

type RegistrationValues = z.infer<AuthSchemas["registrationSchema"]>
import axios from "axios"
import type { OAuthProvider } from "@/lib/auth/providers"
import { OAuthButtons } from "./OAuthButtons"
import { Link, useRouter } from "@/i18n/navigation"

export function RegistrationForm({
  className,
  providers = [],
  ...props
}: React.ComponentProps<"div"> & { providers?: readonly OAuthProvider[] }) {
  const handleSubmitError = useSubmitError()
  const router = useRouter()
  const t = useTranslations("auth")
  const { registrationSchema } = useAuthSchemas()

  const form = useForm<RegistrationValues>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      name: "",
      username: "",
      email: "",
      password: "",
      passwordVerification: "",
    },
  })

  async function onSubmit(values: RegistrationValues) {
    try {
      await axios.post("/api/auth/signup", values)

      // Not signed in yet: that happens after the email is confirmed.
      router.push("/confirm")
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
          <CardTitle className="text-xl">{t("signup.title")}</CardTitle>
          <CardDescription>
            {providers.length ? t("signup.descriptionWithProviders") : t("signup.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <div className="grid gap-6">
                <OAuthButtons providers={providers} />
                <div className="grid gap-6">
                  <AuthField control={form.control} name="name" label={t("fields.name")} placeholder={t("fields.namePlaceholder")} autoComplete="name" />
                  <AuthField control={form.control} name="username" label={t("fields.username")} placeholder={t("fields.usernamePlaceholder")} autoComplete="username" />
                  <AuthField control={form.control} name="email" label={t("fields.email")} type="email" placeholder={t("fields.emailPlaceholder")} autoComplete="email" />
                  <AuthField control={form.control} name="password" label={t("fields.password")} type="password" autoComplete="new-password" />
                  <AuthField control={form.control} name="passwordVerification" label={t("fields.verifyPassword")} type="password" autoComplete="new-password" />
                  <LoadingButton type="submit" className="w-full" pending={form.formState.isSubmitting} pendingLabel={t("signup.submitting")}>
                    {t("signup.submit")}
                  </LoadingButton>
                </div>
                <div className="text-center text-sm">
                  {t.rich("signup.haveAccount", {
                    link: (chunks) => (
                      <Link href="/login" className="underline underline-offset-4">
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
