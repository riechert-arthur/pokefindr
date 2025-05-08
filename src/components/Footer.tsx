import { FC, SVGProps } from "react"
import { FacebookLogoIcon } from "@/components/icons/FacebookLogoIcon"
import { InstagramLogoIcon } from "@/components/icons/InstagramLogoIcon"
import { XLogoIcon } from "@/components/icons/XLogoIcon"
import { GitHubLogoIcon } from "@/components/icons/GitHubLogoIcon"
import { YouTubeLogoIcon } from "@/components/icons/YouTubeLogoIcon"
import { PokeFindrIcon } from "@/components/icons/PokeFindrIcon"
import Link from "next/link"

interface NavigationLinkProps {
  name: string
  href: string
}

interface NavigationLink extends NavigationLinkProps {
  icon?: FC<SVGProps<SVGSVGElement>>
}

type NavigableSet = Record<string, NavigationLink[]>

const navigation: NavigableSet = {
  Support: [{ name: "Submit ticket", href: "#" }],
  Learn: [{ name: "Blog", href: "/blog" }],
  Legal: [
    { name: "Terms of service", href: "/terms-of-service" },
    { name: "Privacy policy", href: "/privacy-policy" },
  ],
  Social: [
    {
      name: "Facebook",
      href: "#",
      icon: FacebookLogoIcon,
    },
    {
      name: "Instagram",
      href: "#",
      icon: InstagramLogoIcon,
    },
    {
      name: "X",
      href: "#",
      icon: XLogoIcon,
    },
    {
      name: "GitHub",
      href: "#",
      icon: GitHubLogoIcon,
    },
    {
      name: "YouTube",
      href: "#",
      icon: YouTubeLogoIcon,
    },
  ],
}

const SocialLinks: FC = () => {
  return (
    <div className="flex gap-x-6">
      {navigation["Social"].map((item) => (
        <Link
          key={item.name}
          href={item.href}
          className="text-gray-600 hover:text-gray-800"
        >
          <span className="sr-only">{item.name}</span>
          {item.icon && <item.icon aria-hidden="true" className="size-6" />}
        </Link>
      ))}
    </div>
  )
}

const NavigationLink: FC<NavigationLinkProps> = ({ name, href }) => {
  return (
    <li>
      <Link href={href} className="text-sm/6 text-gray-600 hover:text-gray-900">
        {name}
      </Link>
    </li>
  )
}

interface NavigationLinkListProps {
  header: string
  links: NavigationLink[]
}

const NavigationLinkList: FC<NavigationLinkListProps> = ({ header, links }) => {
  return (
    <div>
      <h3 className="text-sm/6 font-semibold text-gray-900">{header}</h3>
      <ul role="list" className="mt-6 space-y-4">
        {links.map((item) => (
          <NavigationLink key={item.name} name={item.name} href={item.href} />
        ))}
      </ul>
    </div>
  )
}

const SiteNavigationLinks: FC = () => {
  const linkCategories = Object.entries(navigation).filter(
    ([key]) => key !== "Social"
  )

  return (
    <div className="mt-16 grid grid-cols-4 gap-8 xl:col-span-2 xl:mt-0">
      {linkCategories.map(([header, links]) => (
        <NavigationLinkList key={header} header={header} links={links} />
      ))}
    </div>
  )
}

export const Footer: FC = () => {
  return (
    <footer className="bg-white">
      <div className="mx-auto max-w-7xl px-6 pb-8 pt-16 sm:pt-24 lg:px-8 lg:pt-32">
        <div className="xl:grid xl:grid-cols-3 xl:gap-8">
          <div className="space-y-8">
            <PokeFindrIcon width="64px" height="64px" />
            <p className="text-balance text-sm/6 text-gray-600">
              Helping users find the Pokemon Card Vending Machines in their area
              with interactive maps.
            </p>
            <SocialLinks />
          </div>
          <SiteNavigationLinks />
        </div>
        <div className="mt-16 border-t border-gray-900/10 pt-8 sm:mt-20 lg:mt-24">
          <p className="text-sm/6 text-gray-600">
            &copy; 2024 PokeFindr, Inc. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
