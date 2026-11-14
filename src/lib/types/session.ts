import type { Role } from "@/lib/auth/roles"
import type { Locale } from "@/i18n/routing"

/** The signed-in user, as `/api/auth/user` returns it and the session context holds it. */
export interface PublicProfile {
  id: string
  username: string
  full_name: string | null
  metadata: unknown
  /** member, moderator or admin: what the app shows (an Admin link); the API checks it again. */
  role: Role
  /** The language they picked (#182), or null. */
  locale: Locale | null
  /** Their profile picture (#290): uploaded, or from Google or Discord. Null shows initials. */
  image: string | null
}
