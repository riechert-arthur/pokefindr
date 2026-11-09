"use client"

import Link from "next/link"
import { useEffect, useState, type ComponentType, type SVGProps } from "react"
import { ChartBarIcon, ChevronDownIcon, FlagIcon, HouseIcon, InboxIcon, MapPinIcon, MegaphoneIcon, RefreshCwIcon, SquarePlusIcon } from "lucide-react"
import { Logo } from "@/components/brand/Logo"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import type { AdminGroup } from "@/lib/admin/sections"
import { cn } from "@/lib/utils"

const ICONS: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  queue: InboxIcon,
  reports: FlagIcon,
  coverage: ChartBarIcon,
  "add-vending": SquarePlusIcon,
  jobs: RefreshCwIcon,
  ads: MegaphoneIcon,
}

/** A section's count beside its name; red when something there is urgent. */
export interface SectionCount {
  count: number
  hot: boolean
}

const COLLAPSED_KEY = "pf-admin-nav-collapsed"

function readCollapsed(): Set<string> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]")
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [])
  } catch {
    return new Set()
  }
}

function Count({ count, hot, label }: SectionCount & { label: string }) {
  return (
    <span
      aria-label={`${count} ${label}`}
      className={cn(
        "ml-auto min-w-5 rounded-full px-1.5 text-center text-caption font-semibold tabular-nums",
        hot ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
      )}
    >
      {count.toLocaleString("en-US")}
    </span>
  )
}

const itemClass =
  "flex min-h-9 shrink-0 items-center gap-2.5 rounded-md px-2.5 text-body text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:bg-muted aria-[current=page]:font-semibold aria-[current=page]:text-foreground"

/**
 * The admin's sidebar (#152), as in the prototype: the logo with an Admin
 * badge; the groups, which fold from their heading (remembered in this
 * browser, a folded group shows its summed count); and links back to the
 * app with the signed-in user. Below 768px it's a scrolling strip and the
 * groups don't fold.
 */
export function AdminSidebar({
  groups,
  current,
  counts,
  onSelect,
  user,
}: {
  groups: readonly AdminGroup[]
  current: string
  counts: Partial<Record<string, SectionCount>>
  onSelect: (section: string) => void
  user: { username: string; role: string }
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  // Read after mount: the server doesn't know this browser's choice.
  useEffect(() => setCollapsed(readCollapsed()), [])
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]))
      } catch {
        // Storage blocked: it still folds for this visit.
      }
      return next
    })

  return (
    <nav
      aria-label="Admin"
      className="flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-background p-2 md:sticky md:top-0 md:h-svh md:w-[236px] md:flex-col md:gap-4 md:overflow-y-auto md:border-b-0 md:border-r md:p-2.5"
    >
      <Link href="/admin" className="hidden items-center gap-2 px-2.5 pt-2 pb-1 font-semibold text-foreground md:flex">
        <Logo variant="mark" size={24} title="" />
        PokeFindr
        <span className="ml-auto rounded-md border border-border px-1.5 text-caption font-normal text-muted-foreground">Admin</span>
      </Link>

      {groups.map((g) => {
        const shut = collapsed.has(g.id)
        const waiting = g.sections.reduce((n, s) => n + (counts[s.id]?.count ?? 0), 0)
        const hot = g.sections.some((s) => counts[s.id]?.hot)
        return (
          <div key={g.id} role="group" aria-labelledby={`admin-group-${g.id}`} className="flex shrink-0 gap-1 md:flex-col md:gap-0.5">
            <button
              type="button"
              id={`admin-group-${g.id}`}
              aria-expanded={!shut}
              aria-controls={`admin-group-items-${g.id}`}
              onClick={() => toggle(g.id)}
              className="hidden items-center gap-1.5 rounded-md px-2.5 py-1 text-overline uppercase text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:flex"
            >
              {g.label}
              {shut && waiting > 0 && <Count count={waiting} hot={hot} label="waiting" />}
              <ChevronDownIcon aria-hidden className={cn("size-3.5 transition-transform", !shut && "ml-auto", shut && waiting === 0 && "ml-auto", shut && "-rotate-90")} />
            </button>
            {/* Folding is desktop-only: on phones every section stays in the strip. */}
            <div id={`admin-group-items-${g.id}`} className={cn("flex gap-1 md:flex-col md:gap-0.5", shut && "md:hidden")}>
              {g.sections.map((s) => {
                const Icon = ICONS[s.id] ?? InboxIcon
                const c = counts[s.id]
                return (
                  <a
                    key={s.id}
                    href={`/admin?section=${s.id}`}
                    aria-current={s.id === current ? "page" : undefined}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
                      e.preventDefault()
                      onSelect(s.id)
                    }}
                    className={itemClass}
                  >
                    <Icon aria-hidden className="size-4 shrink-0" />
                    <span className="whitespace-nowrap">{s.label}</span>
                    {c && c.count > 0 && <Count count={c.count} hot={c.hot} label="waiting" />}
                  </a>
                )
              })}
            </div>
          </div>
        )
      })}

      <div className="flex shrink-0 gap-1 md:mt-auto md:flex-col md:gap-0.5 md:border-t md:border-border md:pt-2.5">
        <Link href="/home" className={itemClass}>
          <HouseIcon aria-hidden className="size-4 shrink-0" />
          <span className="whitespace-nowrap">Back to the app</span>
        </Link>
        <Link href="/map" className={itemClass}>
          <MapPinIcon aria-hidden className="size-4 shrink-0" />
          <span className="whitespace-nowrap">Open the map</span>
        </Link>
        <div className="hidden items-center gap-2.5 px-2.5 py-2 md:flex">
          <Avatar className="size-7">
            <AvatarFallback className="bg-primary text-caption font-semibold text-primary-foreground">{user.username.slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-body text-foreground">{user.username}</span>
            <span className="block text-caption capitalize text-muted-foreground">{user.role}</span>
          </span>
        </div>
      </div>
    </nav>
  )
}
