"use client"

import { cn } from "@/lib/utils"
import { useForm } from "react-hook-form"
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
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { handleSubmitError } from "@/lib/forms"
import { LoadingButton } from "@/components/wrappers/LoadingButton"
import { registrationSchema } from "@/lib/schemas"
import axios from "axios"
import type { OAuthProvider } from "@/lib/auth/providers"
import { OAuthButtons } from "./OAuthButtons"
import { useRouter } from "next/navigation"

export function RegistrationForm({
  className,
  providers = [],
  ...props
}: React.ComponentProps<"div"> & { providers?: readonly OAuthProvider[] }) {
  const router = useRouter() 

  const form = useForm<z.infer<typeof registrationSchema>>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      name: "",
      username: "",
      email: "",
      password: "",
      passwordVerification: "",
    },
  })

  async function onSubmit(values: z.infer<typeof registrationSchema>) {
    try {
      await axios.post("/api/auth/signup", {
        email: values.email,
        password: values.password,
        passwordVerification: values.passwordVerification,
        username: values.username,
        name: values.name,
      })

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
          <CardTitle className="text-xl">Nice to meet you</CardTitle>
          <CardDescription>
            {providers.length ? "Sign up with your account or email" : "Sign up with your email"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <div className="grid gap-6">
                <OAuthButtons providers={providers} />
                <div className="grid gap-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <div className="grid gap-3">
                          <FormLabel>Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Jane Doe" autoComplete="name" {...field} />
                          </FormControl>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <div className="grid gap-3">
                          <FormLabel>Username</FormLabel>
                          <FormControl>
                            <Input placeholder="jdoe1234" autoComplete="username" {...field} />
                          </FormControl>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <div className="grid gap-3">
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="m@example.com" autoComplete="email" {...field} />
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
                          <FormLabel>Password</FormLabel>
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
                          <FormLabel>Verify Password</FormLabel>
                          <FormControl>
                            <Input type="password" autoComplete="new-password" {...field} />
                          </FormControl>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {!form.formState.isSubmitting && (
                    <Button type="submit" className="w-full">
                      Register
                    </Button>
                  )}
                  {form.formState.isSubmitting && (
                    <LoadingButton className="w-full">
                      Registering...
                    </LoadingButton>
                  )}
                </div>
                <div className="text-center text-sm">
                  Have an account already?{" "}
                  <a href="/login" className="underline underline-offset-4">
                    Sign in
                  </a>
                </div>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
      <div className="text-muted-foreground *:[a]:hover:text-primary text-center text-xs text-balance *:[a]:underline *:[a]:underline-offset-4">
        By clicking continue, you agree to our <a href="/terms-of-service">Terms of Service</a>{" "}
        and <a href="/privacy-policy">Privacy Policy</a>.
      </div>
    </div>
  )
}
