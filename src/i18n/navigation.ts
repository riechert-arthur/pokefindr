import { createNavigation } from "next-intl/navigation"
import { routing } from "./routing"

/**
 * Link, redirect and the router, keeping the current language: in Spanish,
 * `<Link href="/map">` goes to `/es/map`, and usePathname() returns `/map`.
 * Lint sends next/link and next/navigation's versions here.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing)
