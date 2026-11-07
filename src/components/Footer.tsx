import Link from "next/link"
import { Logo } from "@/components/brand/Logo"

const LINKS = [
  { name: "Map", href: "/map" },
  { name: "Blog", href: "/blog" },
  { name: "Support", href: "https://discord.gg/f2uUR5bAZU" },
  { name: "Changelog", href: "/changelog" },
  { name: "Privacy policy", href: "/privacy-policy" },
  { name: "Terms of service", href: "/terms-of-service" },
]

/** The site footer, as in the prototype: the logo, the main links and the not-affiliated notice. */
export function Footer() {
  return (
    <footer className="border-t border-border bg-background px-6 py-8">
      <div className="mx-auto flex max-w-[1040px] flex-wrap items-center gap-x-8 gap-y-4">
        <Link href="/" aria-label="PokeFindr home" className="-m-1 p-1">
          <Logo variant="full" size={32} />
        </Link>
        <nav aria-label="Footer" className="flex flex-wrap gap-[18px] text-body">
          {LINKS.map((l) => (
            <Link key={l.name} href={l.href} className="text-muted-foreground hover:text-foreground">
              {l.name}
            </Link>
          ))}
        </nav>
        <p className="basis-full text-caption text-muted-foreground">
          PokeFindr is a fan-made resource and is not affiliated with The Pokémon Company International. Vending machine locations come from the
          Pokémon Center&apos;s list of official U.S. retailers.
        </p>
      </div>
    </footer>
  )
}
