import { useTranslations } from "next-intl"
import { Link } from "@/i18n/navigation"

/** "By clicking continue, you agree to our Terms of Service and Privacy Policy.", under the login and sign-up cards. */
export function Terms() {
  const t = useTranslations("auth")
  return (
    <div className="text-muted-foreground *:[a]:hover:text-primary text-center text-xs text-balance *:[a]:underline *:[a]:underline-offset-4">
      {t.rich("terms", {
        terms: (chunks) => <Link href="/terms-of-service">{chunks}</Link>,
        privacy: (chunks) => <Link href="/privacy-policy">{chunks}</Link>,
      })}
    </div>
  )
}
