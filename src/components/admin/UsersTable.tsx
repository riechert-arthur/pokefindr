"use client"

import { useCallback, useEffect, useId, useRef, useState } from "react"
import { SearchIcon, UsersIcon } from "lucide-react"
import { toast } from "sonner"
import { Badge, type BadgeProps } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { EmptyState } from "@/components/pokefindr/EmptyState"
import { sendAdminAction } from "@/lib/admin/actions"
import { LoadFailed } from "@/components/admin/LoadFailed"
import { Td, Th } from "@/components/admin/table"
import { useOptionalSession, useOptionalSessionLoading } from "@/components/providers/SessionProvider"
import { can } from "@/lib/auth/entitlements"
import { GRANTABLE_ROLES, ROLE_LABELS, ROLES, type GrantableRole, type Role } from "@/lib/auth/roles"
import type { UserPage, UserRow } from "@/lib/admin/users"
import { useFormat } from "@/i18n/format"

/** Staff stand out from members; who can manage users stands out most. */
const variantOf = (role: Role): BadgeProps["variant"] => (can(role, "users.manage") ? "default" : can(role, "moderation.view") ? "secondary" : "outline")

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
  // Until the session is known, your own row can't be told apart, so no row offers a change yet.
  const sessionLoading = useOptionalSessionLoading()
  const [query, setQuery] = useState("")
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [page, setPage] = useState<UserPage | null | "error">(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [editing, setEditing] = useState<UserRow | null>(null)
  const [picked, setPicked] = useState<GrantableRole>("member")
  const [saving, setSaving] = useState(false)
  const pickerId = useId()
  // Bumped by each new search or filter, so a slower answer to an older one is dropped.
  const generation = useRef(0)

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
    const mine = ++generation.current
    try {
      const next = await fetchPage()
      if (mine === generation.current) setPage(next)
    } catch (err) {
      console.error("[admin] couldn't load users", err)
      if (mine === generation.current) setPage("error")
    }
  }, [fetchPage])
  useEffect(() => void load(), [load])

  const loadMore = async () => {
    if (!page || page === "error" || !page.nextCursor) return
    const mine = generation.current
    setLoadingMore(true)
    try {
      const next = await fetchPage(page.nextCursor)
      // The search or filter changed meanwhile: this page belongs to the old list.
      if (mine !== generation.current) return
      setPage((p) => (p && p !== "error" ? { users: [...p.users, ...next.users], nextCursor: next.nextCursor } : p))
    } catch {
      if (mine === generation.current) toast.error("Couldn't load more users. Try again.")
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
      if (!(await sendAdminAction(`/api/admin/users/${editing.id}`, { role: picked }, "PATCH"))) return
      toast.success(`${editing.username} is now ${aRole(picked)}`)
      // Under a role filter, someone who no longer has that role leaves the list.
      const stays = filter === "all" || filter === picked
      setPage((p) =>
        p && p !== "error"
          ? { ...p, users: stays ? p.users.map((u) => (u.id === editing.id ? { ...u, role: picked } : u)) : p.users.filter((u) => u.id !== editing.id) }
          : p,
      )
      setEditing(null)
    } catch (err) {
      console.error("[admin] couldn't change a role", err)
      toast.error("That didn't work. Check your connection and try again.")
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
        <LoadFailed what="users" onRetry={() => void load()} />
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
                  <Th>Username</Th>
                  <Th>Name</Th>
                  <Th>Email</Th>
                  <Th>Role</Th>
                  <Th>Joined</Th>
                  <Th className="text-right">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {page.users.map((u) => (
                  <tr key={u.id} className="border-b border-border last:border-b-0">
                    <Td className="font-semibold text-foreground">{u.username}</Td>
                    <Td>{u.name}</Td>
                    <Td className="break-all">{u.email}</Td>
                    <Td>
                      <Badge variant={variantOf(u.role)}>{ROLE_LABELS[u.role]}</Badge>
                    </Td>
                    <Td>{f.ago(u.joinedAt)}</Td>
                    <Td className="text-right">
                      {sessionLoading ? null : u.id === selfId ? (
                        <span className="text-caption text-muted-foreground">You</span>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => startEditing(u)} aria-label={`Change ${u.username}'s role`}>
                          Change role
                        </Button>
                      )}
                    </Td>
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
