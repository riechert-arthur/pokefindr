import type { Role } from "@/lib/auth/roles"

/** Who may use the admin (#152): moderators (Moderation) and admins (everything). */
export type StaffRole = Extract<Role, "moderator" | "admin">
