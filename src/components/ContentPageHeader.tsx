"use client"

import type { FC, Dispatch, SetStateAction } from "react"
import { MenuIcon } from "lucide-react"
import { Logo } from "@/components/brand/Logo"
import { useEffect, useState } from "react"
import { LG_UP, useMediaQuery } from "@/hooks/use-media-query"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { Link } from "@/i18n/navigation"
import { UserMenu } from "@/components/pokefindr/UserMenu"
import { useSessionContext } from "./providers/SessionProvider"
import { useTranslations } from "next-intl"

/** A full-width link in the nav drawer and header ("Log in", Settings, Log out). */
const NAV_ITEM = "-mx-3 flex items-center gap-2 rounded-lg px-3 py-2.5 text-base/7 font-semibold text-foreground hover:bg-muted/50"

export interface NavigationLink {
  name: string
  href: string
}

interface MobileMenuProps {
  mobileMenuOpen: boolean
  setMobileMenuOpen: Dispatch<SetStateAction<boolean>>
  navigation: NavigationLink[]
}

export const MobileMenu: FC<MobileMenuProps> = ({
  mobileMenuOpen,
  setMobileMenuOpen,
  navigation,
}) => {
  const t = useTranslations("content.header")
  const { session } = useSessionContext()
  // The menu is hidden from lg up. Close it when the window widens past lg, or
  // its overlay and scroll lock would stay with no visible panel.
  const desktop = useMediaQuery(LG_UP)
  useEffect(() => {
    if (desktop) setMobileMenuOpen(false)
  }, [desktop, setMobileMenuOpen])

  return (
    <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
      <SheetContent side="right" closeLabel={t("closeMenu")} overlayClassName="bg-transparent lg:hidden" aria-describedby={undefined} className="w-full overflow-y-auto bg-card px-6 py-6 sm:max-w-sm lg:hidden">
        <SheetTitle className="sr-only">{t("menu")}</SheetTitle>
        <div className="flex items-center justify-between pr-8">
          <Link href="/" className="-m-1.5 p-1.5" onClick={() => setMobileMenuOpen(false)}>
            <Logo variant="full" size={32} />
          </Link>
        </div>
        <div className="mt-6 flow-root">
          <div className="-my-6 divide-y divide-border">
            <div className="space-y-2 py-6">
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className="-mx-3 block rounded-lg px-3 py-2 text-base/7 font-semibold text-foreground hover:bg-muted/50"
                >
                  {item.name}
                </Link>
              ))}
            </div>
            <div className="py-6">
              {!session ? (
                <Link
                  href="/login"
                  className={NAV_ITEM}
                >
                  {t("logIn")}
                </Link>
              ) : (
                <UserMenu
                  variant="list"
                  itemClassName={NAV_ITEM}
                  userName={session.username}
                  imageUrl={session.image}
                />
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

interface HeaderProps {
  navigation: NavigationLink[]
}

export const ContentPageHeader: FC<HeaderProps> = ({ navigation }) => {
  const t = useTranslations("content.header")
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { session } = useSessionContext()

  return (
    <header className="absolute inset-x-0 top-0 z-50">
      <nav
        aria-label={t("navLabel")}
        className="flex items-center justify-between p-6 md:py-0 lg:px-8"
      >
        <div className="flex lg:flex-1">
          <Link href="/" className="-m-1.5 p-1.5">
            <Logo variant="full" size={32} />
          </Link>
        </div>
        <div className="flex lg:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="-m-2.5 inline-flex items-center justify-center rounded-md p-2.5 text-foreground"
          >
            <span className="sr-only">{t("openMenu")}</span>
            <MenuIcon aria-hidden="true" className="size-6" />
          </button>
        </div>
        <div className="hidden lg:flex lg:gap-x-12">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="text-sm/6 font-semibold text-foreground"
            >
              {item.name}
            </Link>
          ))}
        </div>
        <div className="hidden lg:flex lg:flex-1 lg:justify-end">
          <div className="py-4">
            {!session ? (
              <Link
                href="/login"
                className={NAV_ITEM}
              >
                {t("logIn")} &rarr;
              </Link>
            ) : (
              <UserMenu
                userName={session.username}
                imageUrl={session.image}
              />
            )
          }
          </div>
        </div>
      </nav>

      <MobileMenu
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        navigation={navigation}
      />
    </header>
  )
}
