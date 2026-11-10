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
import { loginSchema } from "@/lib/schemas"
import axios from "axios"
import { toast } from "sonner"
import { broadcastAuth } from "@/lib/auth/broadcast"
import type { OAuthProvider } from "@/lib/auth/providers"
import { OAuthButtons } from "./OAuthButtons"

/** A message to show above the form: why the visitor landed on /login. */
export type LoginNotice = "verified" | "link-expired" | "oauth-failed" | "connect-app"

const NOTICES: Record<LoginNotice, { text: string; tone: "ok" | "warn" }> = {
  verified: { text: "Your email is confirmed. Log in to get started.", tone: "ok" },
  "link-expired": { text: "That link has expired or was already used. Log in and we'll send a new one.", tone: "warn" },
  "oauth-failed": { text: "That sign-in didn't go through. Try again, or use your email.", tone: "warn" },
  "connect-app": { text: "Log in to connect an app to your PokeFindr account. You'll see what it's asking for next.", tone: "ok" },
}

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

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  })

  async function onSubmit(values: z.infer<typeof loginSchema>) {
    try {
      await axios.post("/api/auth/login", values, { withCredentials: true })
      toast.success("Logged in!")
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
          <CardTitle className="text-xl">Welcome back</CardTitle>
          <CardDescription>
            {providers.length ? "Log in with your account or email" : "Log in with your email"}
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
              {NOTICES[notice].text}
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
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input placeholder="m@example.com" {...field} />
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
                            <FormLabel>Password</FormLabel>
                            <Link href="/forgot-password" className="ml-auto text-sm underline-offset-4 hover:underline">
                              Forgot your password?
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
                      Login
                    </Button>
                  )}
                  {form.formState.isSubmitting && (
                    <LoadingButton className="w-full">
                      Logging in...
                    </LoadingButton>
                  )}
                </div>
                <div className="text-center text-sm">
                  Don&apos;t have an account?{" "}
                  <Link href="/signup" className="underline underline-offset-4">
                    Sign up
                  </Link>
                </div>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
      <div className="text-muted-foreground *:[a]:hover:text-primary text-center text-xs text-balance *:[a]:underline *:[a]:underline-offset-4">
        By clicking continue, you agree to our <Link href="/terms-of-service">Terms of Service</Link>{" "}
        and <Link href="/privacy-policy">Privacy Policy</Link>.
      </div>
    </div>
  )
}
