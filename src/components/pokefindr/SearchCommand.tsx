"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { Command as CommandPrimitive } from "cmdk"
import { LoaderCircleIcon, SearchIcon, XIcon } from "lucide-react"
import { Command, CommandGroup, CommandList } from "@/components/ui/command"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface SearchCommandItem {
  /** Unique within the list. */
  id: string
  group: "areas" | "locations"
  label: string
  /** A second line, e.g. a location's address. */
  detail?: string
  /** Right-aligned, e.g. "42 places within 10 mi". */
  meta?: string
  icon: ReactNode
}

export type SearchCommandStatus = "idle" | "loading" | "ready" | "error"

interface SearchCommandProps {
  query: string
  onQueryChange: (query: string) => void
  items: readonly SearchCommandItem[]
  status: SearchCommandStatus
  onPick: (id: string) => void
  /** `hero`: the landing page's big box with a Search button. `panel`: the map's. */
  variant?: "hero" | "panel"
  placeholder: string
  /** The input's accessible name. */
  label?: string
  /** Shows a clear button while there's text. */
  onClear?: () => void
  /** Before the search icon, e.g. the phone menu button. */
  leading?: ReactNode
  /** The shortest query that searches. */
  minLength?: number
  /**
   * Where the list drops: `auto` flips above when there's no room below (the
   * map's bottom panel on phones); `below` always opens under the box and
   * shrinks to fit (the landing page, which scrolls).
   */
  placement?: "auto" | "below"
  className?: string
}

const GROUPS = [
  { key: "areas", heading: "Areas" },
  { key: "locations", heading: "Locations" },
] as const

/**
 * The search box for the landing hero and the map: type a city, ZIP or
 * address, pick from Areas (places from the geocoder) and Locations (our own
 * places) with the arrow keys and Enter, as in the redesign prototype. It
 * only displays; the caller fetches `items` for `query` (see PlaceSearch).
 * Enter before the results arrive picks the first one when they do.
 */
export function SearchCommand({
  query,
  onQueryChange,
  items,
  status,
  onPick,
  variant = "panel",
  placeholder,
  label = "Search a location",
  onClear,
  leading,
  minLength = 2,
  placement = "auto",
  className,
}: SearchCommandProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const [focused, setFocused] = useState(false)
  // Escape or a pick closes the list until the next keystroke.
  const [dismissed, setDismissed] = useState(false)
  // The highlighted item, by id: the first one whenever the list changes
  // (new ids), but not when the same items update (counts arriving).
  const [selected, setSelected] = useState("")
  // Enter (or Search) before the results arrived: pick the first when they do.
  const [pending, setPending] = useState(false)

  const searchable = query.trim().length >= minLength
  const firstId = items[0]?.id ?? ""
  const idsKey = items.map((i) => i.id).join("\n")
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setSelected(firstId), [idsKey])

  const pick = (id: string) => {
    setPending(false)
    setDismissed(true)
    onPick(id)
  }

  useEffect(() => {
    if (!pending) return
    if (items.length && status !== "loading") pick(items[0].id)
    else if (status === "ready" || status === "error") setPending(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, items, status])

  /** Enter or the Search button: the highlighted result, or the first one once it arrives. */
  const submit = () => {
    if (!searchable) {
      inputRef.current?.focus()
      return
    }
    setDismissed(false)
    if (items.length && status !== "loading") pick(selected || items[0].id)
    else setPending(true)
  }

  const open = focused && !dismissed && searchable && status !== "idle"
  const hero = variant === "hero"

  // cmdk always renders aria-expanded="true" (its list is always visible);
  // here the list closes, so say so. React leaves the attribute alone after
  // mount because cmdk's value never changes.
  useEffect(() => {
    inputRef.current?.setAttribute("aria-expanded", String(open))
  }, [open])

  const announcement =
    !searchable || status === "idle" || status === "loading"
      ? ""
      : status === "error"
        ? "Search isn't working right now."
        : items.length === 0
          ? "No matches."
          : `${items.length} result${items.length === 1 ? "" : "s"}. Use the arrow keys to move and Enter to open.`

  return (
    <Command
      shouldFilter={false}
      value={selected}
      onValueChange={setSelected}
      label={label}
      // The list drops down in a popover; the root is just the input row.
      className={cn("h-auto overflow-visible bg-transparent", className)}
    >
      <Popover open={open} onOpenChange={(o) => !o && setDismissed(true)}>
        <PopoverAnchor asChild>
          <div
            ref={anchorRef}
            className={cn(
              "flex items-center gap-2 border border-border bg-card text-card-foreground transition-colors focus-within:border-ring",
              hero ? "rounded-[14px] pl-4 pr-2 shadow-lg" : "rounded-xl pl-3 pr-1.5 shadow-md",
            )}
          >
            {leading}
            {status === "loading" && searchable ? (
              <LoaderCircleIcon aria-hidden className={cn("shrink-0 animate-spin text-muted-foreground", hero ? "size-5" : "size-4")} />
            ) : (
              <SearchIcon aria-hidden className={cn("shrink-0 text-muted-foreground", hero ? "size-5" : "size-4")} />
            )}
            <CommandPrimitive.Input
              ref={inputRef}
              value={query}
              onValueChange={(v) => {
                setDismissed(false)
                setPending(false)
                onQueryChange(v)
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  submit()
                }
                if (e.key === "Escape" && open) e.stopPropagation()
              }}
              placeholder={placeholder}
              aria-label={label}
              className={cn(
                "min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground",
                hero ? "h-[58px] text-body-lg" : "h-10 text-body",
              )}
            />
            {onClear && query && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                aria-label="Clear search"
                onClick={() => {
                  onClear()
                  inputRef.current?.focus()
                }}
              >
                <XIcon className="size-4" aria-hidden />
              </Button>
            )}
            {hero && (
              <Button type="button" onClick={submit} className="shrink-0">
                Search
              </Button>
            )}
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          side="bottom"
          sideOffset={6}
          avoidCollisions={placement === "auto"}
          // Focus stays in the input: typing and the arrow keys keep working.
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            if (anchorRef.current?.contains(e.target as Node)) e.preventDefault()
          }}
          className="w-[var(--radix-popover-trigger-width)] rounded-lg p-1"
        >
          {/* At most 20rem, and never past the space the popover has (less the footer, shown from sm up). */}
          <CommandList className="max-h-[min(20rem,calc(var(--radix-popover-content-available-height)-0.5rem))] sm:max-h-[min(20rem,calc(var(--radix-popover-content-available-height)-3.5rem))]">
            <CommandPrimitive.Empty className="px-2.5 py-3.5 text-body text-muted-foreground">
              {status === "error" ? (
                "Search isn't working right now. Try again in a moment."
              ) : status === "loading" ? (
                "Searching…"
              ) : (
                <>No places match &ldquo;{query.trim()}&rdquo;. Try a city, ZIP code or street address.</>
              )}
            </CommandPrimitive.Empty>
            {GROUPS.map(({ key, heading }) => {
                const group = items.filter((i) => i.group === key)
                if (!group.length) return null
                return (
                  <CommandGroup
                    key={key}
                    heading={heading}
                    className="p-0 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-overline [&_[cmdk-group-heading]]:tracking-normal [&_[cmdk-group-heading]]:text-muted-foreground"
                  >
                    {group.map((item) => (
                      // The primitive, not ui/CommandItem: its [&_svg]:size-4 would resize the icons inside KindDot.
                      <CommandPrimitive.Item
                        key={item.id}
                        value={item.id}
                        onSelect={() => pick(item.id)}
                        className="flex cursor-pointer select-none items-center gap-2.5 rounded-lg p-2 text-body text-foreground outline-none data-[selected=true]:bg-muted"
                      >
                        {item.icon}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{item.label}</span>
                          {item.detail && <span className="block truncate text-caption text-muted-foreground">{item.detail}</span>}
                        </span>
                        {item.meta && <span className="ml-auto shrink-0 whitespace-nowrap pl-2 text-caption tabular-nums text-muted-foreground">{item.meta}</span>}
                      </CommandPrimitive.Item>
                    ))}
                  </CommandGroup>
                )
              })}
          </CommandList>
          <div aria-hidden className="mt-1 hidden items-center gap-1.5 border-t border-border p-2 text-overline font-normal tracking-normal text-muted-foreground sm:flex">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> to move <Kbd>↵</Kbd> to open
          </div>
        </PopoverContent>
      </Popover>
      <span role="status" className="sr-only">
        {announcement}
      </span>
    </Command>
  )
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-border px-1.5 py-px font-mono text-overline font-normal tracking-normal text-muted-foreground">{children}</kbd>
}
