import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "../../helpers/intl"
import { UsersTable } from "@/components/admin/UsersTable"
import type { UserRow } from "@/lib/admin/users"

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))
import { toast } from "sonner"

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

const joined = new Date(Date.now() - 3 * 86400_000).toISOString()
const USERS: UserRow[] = [
  { id: "1", username: "misty", name: "Misty Waterflower", email: "misty@pokefindr.local", role: "member", joinedAt: joined },
  { id: "2", username: "moderator", name: "Dev Moderator", email: "moderator@pokefindr.local", role: "moderator", joinedAt: joined },
  { id: "3", username: "superadmin", name: "Dev Super Admin", email: "superadmin@pokefindr.local", role: "super_admin", joinedAt: joined },
]

function stubApi(patch: (id: string, role: string) => Response = (_, role) => new Response(JSON.stringify({ status: "done", to: role }))) {
  const calls: string[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}${init?.body ? ` ${init.body}` : ""}`)
      if (init?.method === "PATCH") return patch(url.split("/").pop()!, (JSON.parse(String(init.body)) as { role: string }).role)
      const q = new URL(url, "http://x").searchParams
      const users = USERS.filter((u) => (!q.get("q") || u.username.includes(q.get("q")!)) && (!q.get("role") || u.role === q.get("role")))
      return new Response(JSON.stringify({ users, nextCursor: null }))
    }),
  )
  return calls
}

describe("UsersTable", () => {
  it("lists each user's username, name, email, role and when they joined", async () => {
    stubApi()
    render(<UsersTable />)
    const misty = (await screen.findByText("misty")).closest("tr")!
    expect(within(misty).getByText("Misty Waterflower")).toBeInTheDocument()
    expect(within(misty).getByText("misty@pokefindr.local")).toBeInTheDocument()
    expect(within(misty).getByText("Member")).toBeInTheDocument()
    expect(within(misty).getByText("3 days ago")).toBeInTheDocument()
    expect(within(screen.getByText("superadmin").closest("tr")!).getByText("Super admin")).toBeInTheDocument()
  })

  it("searches and filters by role through the API", async () => {
    const calls = stubApi()
    render(<UsersTable />)
    await screen.findByText("misty")
    fireEvent.change(screen.getByRole("searchbox", { name: "Search users" }), { target: { value: "mist" } })
    await waitFor(() => expect(calls).toContain("GET /api/admin/users?q=mist"))
    fireEvent.click(screen.getByRole("radio", { name: "Member" }))
    await waitFor(() => expect(calls).toContain("GET /api/admin/users?q=mist&role=member"))
    expect(screen.queryByText("moderator@pokefindr.local")).toBeNull()
  })

  it("changes a role only after confirming, then shows the new one", async () => {
    const calls = stubApi()
    render(<UsersTable />)
    fireEvent.click(await screen.findByRole("button", { name: "Change misty's role" }))
    const dialog = await screen.findByRole("dialog")
    // Super admin can't be granted here.
    expect(within(dialog).queryByRole("radio", { name: "Super admin" })).toBeNull()
    expect(within(dialog).getByRole("button", { name: "Make misty a member" })).toBeDisabled()
    fireEvent.click(within(dialog).getByRole("radio", { name: "Moderator" }))
    expect(calls.filter((c) => c.startsWith("PATCH"))).toEqual([])
    fireEvent.click(within(dialog).getByRole("button", { name: "Make misty a moderator" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(calls).toContain(`PATCH /api/admin/users/1 {"role":"moderator"}`)
    expect(within(screen.getByText("misty").closest("tr")!).getByText("Moderator")).toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith("misty is now a moderator")
  })

  it("keeps the role and says why when the server refuses", async () => {
    stubApi(() => new Response(JSON.stringify({ status: "last_super_admin", error: "That's the last super admin. Make someone else one first." }), { status: 409 }))
    render(<UsersTable />)
    fireEvent.click(await screen.findByRole("button", { name: "Change superadmin's role" }))
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Make superadmin an admin" }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("That's the last super admin. Make someone else one first."))
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(within(screen.getByText("superadmin").closest("tr")!).getByText("Super admin")).toBeInTheDocument()
  })

  it("offers a retry when the list doesn't load", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })))
    render(<UsersTable />)
    expect(await screen.findByText("Couldn't load users")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument()
  })
})
