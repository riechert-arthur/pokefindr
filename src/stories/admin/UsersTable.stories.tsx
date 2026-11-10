import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { UsersTable } from "@/components/admin/UsersTable"
import { Toaster } from "@/components/ui/sonner"
import type { UserRow } from "@/lib/admin/users"

const day = 86400_000
const USERS: UserRow[] = [
  { id: "00000000-0000-4000-8000-0000000000a2", username: "misty", name: "Misty Waterflower", email: "misty@pokefindr.local", role: "member", joinedAt: new Date(Date.now() - 2 * day).toISOString() },
  { id: "00000000-0000-4000-8000-0000000000a1", username: "ash", name: "Ash Ketchum", email: "ash@pokefindr.local", role: "member", joinedAt: new Date(Date.now() - 9 * day).toISOString() },
  { id: "00000000-0000-4000-8000-0000000000d1", username: "moderator", name: "Dev Moderator", email: "moderator@pokefindr.local", role: "moderator", joinedAt: new Date(Date.now() - 30 * day).toISOString() },
  { id: "00000000-0000-4000-8000-00000000de70", username: "dev", name: "Dev User", email: "dev@pokefindr.local", role: "admin", joinedAt: new Date(Date.now() - 60 * day).toISOString() },
  { id: "00000000-0000-4000-8000-0000000000d0", username: "superadmin", name: "Dev Super Admin", email: "superadmin@pokefindr.local", role: "super_admin", joinedAt: new Date(Date.now() - 90 * day).toISOString() },
]

/** Answers /api/admin/users in the browser: searches and filters USERS, and accepts every role change. */
function stubUsersApi(answer: (url: URL, init?: RequestInit) => Response | null) {
  const real = window.fetch
  window.fetch = async (input, init) => {
    const url = new URL(String(input instanceof Request ? input.url : input), window.location.origin)
    return url.pathname.startsWith("/api/admin/users") ? (answer(url, init) ?? real(input, init)) : real(input, init)
  }
  return () => {
    window.fetch = real
  }
}

const listing = (url: URL, init?: RequestInit) => {
  if (init?.method === "PATCH") return Response.json({ status: "done" })
  const q = url.searchParams.get("q")?.toLowerCase() ?? ""
  const role = url.searchParams.get("role")
  const users = USERS.filter((u) => (!q || u.username.includes(q) || u.name.toLowerCase().includes(q) || u.email.startsWith(q)) && (!role || u.role === role))
  return Response.json({ users, nextCursor: null })
}

const meta = {
  title: "Admin/UsersTable",
  component: UsersTable,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <>
        <Story />
        <Toaster />
      </>
    ),
  ],
  beforeEach: () => stubUsersApi(listing),
} satisfies Meta<typeof UsersTable>
export default meta

export const Default: StoryObj<typeof meta> = {}

/** The list didn't load: a retry. */
export const LoadFails: StoryObj<typeof meta> = {
  beforeEach: () => stubUsersApi(() => new Response("", { status: 500 })),
}
