import { Footer } from "@/components/Footer"
import { setPageLocale, type LocaleParams } from "@/i18n/static"

export default async function VisitorLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode
}> & LocaleParams) {
  await setPageLocale(params)
  return (
    <>
      { children }
      <Footer />
    </>
  )
}
