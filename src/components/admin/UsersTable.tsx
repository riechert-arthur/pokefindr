"use client"

import { useCallback, useEffect, useId, useState } from "react"
import { SearchIcon, TriangleAlertIcon, UsersIcon } from "lucide-react"
import { toast } from "sonner"
import { Badge, type BadgeProps } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { EmptyState } from "@/components/pokefindr/EmptyState"
import { useOptionalSession } from "@/components/providers/SessionProvider"
import { can } from "@/lib/auth/entitlements"
import { GRANTABLE_ROLES, ROLE_LABELS, ROLES, type GrantableRole, type Role } from "@/lib/auth/roles"
import type { UserPage, UserRow } from "@/lib/admin/users"
import { cn } from "@/lib/utils"
import { useFormat } from "@/i18n/format"

const th = "px-3 py-2.5 text-left text-caption font-semibold text-muted-foreground"
const td = "px-3 py-3 align-top text-body"

/** Staff stand out from members; who can manage users stands out most. */
const variantOf = (role: Role): BadgeProps["variant"] => (can(role, "users.manage") ? "default" : can(role, "admin.open") ? "secondary" : "outline")

/** How long typing pauses before the search runs. */
const SEARCH_DELAY_MS = 250

type Filter = Role | "all"

/** "a moderator", "an admin". */
const aRole = (role: Role) => {
  const label = ROLE_LABELS[role].toLowerCase()
  return `${/^[aeiou]/.test(label) ? "an" : "a"} ${label}`
}

/**
 * Admin → Users (#294), for super admins: search by username, name or the
 * start of an email, filter by role, and change someone's role (member,
 * moderator or admin) after confirming. Your own role can't be changed here,
 * and the server refuses removing the last super admin. The new role applies
 * on that person's next page load.
 */
export function UsersTable() {
  const f = useFormat()
  const selfId = useOptionalSession()?.id
  const [query, setQuery] = useState("")
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [page, setPage] = useState<UserPage | null | "error">(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [editing, setEditing] = useState<UserRow | null>(null)
  const [picked, setPicked] = useState<GrantableRole>("member")
  const [saving, setSaving] = useState(false)
  const pickerId = useId()

  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [query])

  const fetchPage = useCallback(
    async (cursor?: string) => {
      const params = new URLSearchParams()
      if (search) params.set("q", search)
      if (filter !== "all") params.set("role", filter)
      if (cursor) params.set("cursor", cursor)
      const res = await fetch(`/api/admin/users?${params}`, { cache: "no-store" })
      if (!res.ok) throw new Error(`users answered ${res.status}`)
      return (await res.json()) as UserPage
    },
    [search, filter],
  )

  const load = useCallback(async () => {
    try {
      setPage(await fetchPage())
    } catch (err) {
      console.error("[admin] couldn't load users", err)
      setPage("error")
    }
  }, [fetchPage])
  useEffect(() => void load(), [load])

  const loadMore = async () => {
    if (!page || page === "error" || !page.nextCursor) return
    setLoadingMore(true)
    try {
      const next = await fetchPage(page.nextCursor)
      setPage({ users: [...page.users, ...next.users], nextCursor: next.nextCursor })
    } catch {
      toast.error("Couldn't load more users. Try again.")
    } finally {
      setLoadingMore(false)
    }
  }

  const startEditing = (u: UserRow) => {
    setEditing(u)
    setPicked((GRANTABLE_ROLES as readonly Role[]).includes(u.role) ? (u.role as GrantableRole) : "admin")
  }

  const confirm = async () => {
    if (!editing) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/users/${editing.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: picked }) })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(data.error ?? "That didn't work. Try again.")
        return
      }
      toast.success(`${editing.username} is now ${aRole(picked)}`)
      setPage((p) => (p && p !== "error" ? { ...p, users: p.users.map((u) => (u.id === editing.id ? { ...u, role: picked } : u)) } : p))
      setEditing(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <SearchIcon aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" aria-label="Search users" placeholder="Username, name or email" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8" />
        </div>
        <ToggleGroup
          type="single"
          required
          value={filter}
          onValueChange={(v) => v && setFilter(v as Filter)}
          aria-label="Role"
          className="gap-0 overflow-hidden rounded-md border border-border"
        >
          {(["all", ...ROLES] as const).map((r) => (
            <ToggleGroupItem
              key={r}
              value={r}
              className="h-8 rounded-none border-r border-border bg-background px-2.5 text-body font-normal text-foreground last:border-r-0 hover:bg-muted hover:text-foreground data-[state=on]:bg-foreground data-[state=on]:text-background"
            >
              {r === "all" ? "All" : ROLE_LABELS[r]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {page === null ? (
        <p className="text-body text-muted-foreground">Loading users…</p>
      ) : page === "error" ? (
        <EmptyState icon={TriangleAlertIcon} title="Couldn't load users" action={<Button onClick={() => void load()}>Try again</Button>}>
          Check your connection, then try again.
        </EmptyState>
      ) : page.users.length === 0 ? (
        <EmptyState icon={UsersIcon} title="No users found">
          {search ? "Nobody matches that search." : "Nobody has that role."}
        </EmptyState>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[760px] border-collapse">
              <caption className="sr-only">Users</caption>
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  <th scope="col" className={th}>Username</th>
                  <th scope="col" className={th}>Name</th>
                  <th scope="col" className={th}>Email</th>
                  <th scope="col" className={th}>Role</th>
                  <th scope="col" className={th}>Joined</th>
                  <th scope="col" className={cn(th, "text-right")}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {page.users.map((u) => (
                  <tr key={u.id} className="border-b border-border last:border-b-0">
                    <td className={cn(td, "font-semibold text-foreground")}>{u.username}</td>
                    <td className={td}>{u.name}</td>
                    <td className={cn(td, "break-all")}>{u.email}</td>
                    <td className={td}>
                      <Badge variant={variantOf(u.role)}>{ROLE_LABELS[u.role]}</Badge>
                    </td>
                    <td className={td}>{f.ago(u.joinedAt)}</td>
                    <td className={cn(td, "text-right")}>
                      {u.id === selfId ? (
                        <span className="text-caption text-muted-foreground">You</span>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => startEditing(u)} aria-label={`Change ${u.username}'s role`}>
                          Change role
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {page.nextCursor && (
            <Button variant="outline" className="self-center" disabled={loadingMore} onClick={() => void loadMore()}>
              {loadingMore ? "Loading…" : "Show more"}
            </Button>
          )}
        </>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && !saving && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change {editing?.username}&apos;s role</DialogTitle>
            <DialogDescription>
              Now {editing ? aRole(editing.role) : ""}. The new role applies on their next page load. Super admin can only be given outside this screen.
            </DialogDescription>
          </DialogHeader>
          <RadioGroup value={picked} onValueChange={(v) => setPicked(v as GrantableRole)} aria-label="New role" className="gap-2">
            {GRANTABLE_ROLES.map((r) => (
              <div key={r} className="flex items-center gap-2">
                <RadioGroupItem value={r} id={`${pickerId}-${r}`} />
                <Label htmlFor={`${pickerId}-${r}`}>{ROLE_LABELS[r]}</Label>
              </div>
            ))}
          </RadioGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={saving}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="button" disabled={saving || picked === editing?.role} onClick={() => void confirm()}>
              {editing ? `Make ${editing.username} ${aRole(picked)}` : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
