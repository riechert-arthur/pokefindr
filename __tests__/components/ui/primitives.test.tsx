import React from "react"
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

// ContextProviders' session and ad providers fetch on mount; pass children through.
vi.mock("@/components/providers/SessionProvider", () => ({ SessionContextProvider: ({ children }: { children: React.ReactNode }) => children }))
vi.mock("@/components/providers/AdContextProvider", () => ({ AdContextProvider: ({ children }: { children: React.ReactNode }) => children }))

import { ContextProviders } from "@/components/providers/ContextProviders"

const tooltip = (
  <Tooltip>
    <TooltipTrigger>Locate</TooltipTrigger>
    <TooltipContent>Show my location</TooltipContent>
  </Tooltip>
)

describe("shadcn primitives (batch 1)", () => {
  it.each([
    // Radix opens on focus right away, whatever the delay.
    ["focus", (el: HTMLElement) => fireEvent.focus(el)],
    // On hover it waits for the provider's delay (Radix's default is 700ms), so
    // opening inside 300ms shows the provider's 0ms is used.
    ["hover", (el: HTMLElement) => fireEvent.pointerMove(el, { pointerType: "mouse" })],
  ])("Tooltip opens on %s using the TooltipProvider's delay", async (_how, open) => {
    render(<TooltipProvider delayDuration={0}>{tooltip}</TooltipProvider>)
    open(screen.getByRole("button", { name: "Locate" }))
    expect((await screen.findAllByText("Show my location", {}, { timeout: 300 })).length).toBeGreaterThan(0)
  })

  it("Tooltip works inside the app's ContextProviders", () => {
    // Throws "must be used within TooltipProvider" if ContextProviders lost it.
    expect(() => render(<ContextProviders>{tooltip}</ContextProviders>)).not.toThrow()
    expect(screen.getByRole("button", { name: "Locate" })).toBeInTheDocument()
  })

  it("Checkbox shows a dash, not a check, when indeterminate", () => {
    const { container } = render(<Checkbox aria-label="All retailers" checked="indeterminate" />)
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "mixed")
    expect(container.querySelector("svg.lucide-minus")).toHaveClass("group-data-[state=indeterminate]:block")
    expect(container.querySelector("svg.lucide-check")).toHaveClass("hidden", "group-data-[state=checked]:block")
  })

  it("a required single ToggleGroup doesn't clear when the pressed item is clicked", () => {
    const onValueChange = vi.fn()
    render(
      <ToggleGroup type="single" required value="10" onValueChange={onValueChange}>
        <ToggleGroupItem value="5">5 mi</ToggleGroupItem>
        <ToggleGroupItem value="10">10 mi</ToggleGroupItem>
      </ToggleGroup>,
    )
    fireEvent.click(screen.getByRole("radio", { name: "10 mi" }))
    expect(onValueChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("radio", { name: "5 mi" }))
    expect(onValueChange).toHaveBeenCalledWith("5")
  })

  it("Checkbox toggles and exposes its state", () => {
    render(<Checkbox aria-label="Safeway" />)
    const box = screen.getByRole("checkbox", { name: "Safeway" })
    expect(box).toHaveAttribute("aria-checked", "false")
    fireEvent.click(box)
    expect(box).toHaveAttribute("aria-checked", "true")
  })

  it("ToggleGroup (single) marks the chosen item pressed", () => {
    render(
      <ToggleGroup type="single" defaultValue="10" aria-label="Radius">
        {["5", "10", "25"].map((r) => (
          <ToggleGroupItem key={r} value={r}>{`${r} mi`}</ToggleGroupItem>
        ))}
      </ToggleGroup>,
    )
    expect(screen.getByRole("radio", { name: "10 mi" })).toHaveAttribute("data-state", "on")
    fireEvent.click(screen.getByRole("radio", { name: "25 mi" }))
    expect(screen.getByRole("radio", { name: "25 mi" })).toHaveAttribute("data-state", "on")
    expect(screen.getByRole("radio", { name: "10 mi" })).toHaveAttribute("data-state", "off")
  })

  it("Command filters items as you type", () => {
    render(
      <Command>
        <CommandInput placeholder="Search" />
        <CommandList>
          <CommandEmpty>No results</CommandEmpty>
          <CommandGroup heading="Areas">
            <CommandItem>Denver, CO</CommandItem>
            <CommandItem>Seattle, WA</CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>,
    )
    fireEvent.change(screen.getByPlaceholderText("Search"), { target: { value: "sea" } })
    expect(screen.getByRole("option", { name: "Seattle, WA" })).toBeInTheDocument()
    expect(screen.queryByRole("option", { name: "Denver, CO" })).toBeNull()
  })

  it("Popover opens from its trigger", () => {
    render(
      <Popover>
        <PopoverTrigger>Filters</PopoverTrigger>
        <PopoverContent>Retailers</PopoverContent>
      </Popover>,
    )
    expect(screen.queryByText("Retailers")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Filters" }))
    expect(screen.getByText("Retailers")).toBeInTheDocument()
  })

  it("Badge variants use tokens", () => {
    render(
      <>
        <Badge>Live</Badge>
        <Badge variant="outline">Sample</Badge>
      </>,
    )
    expect(screen.getByText("Live")).toHaveClass("bg-primary")
    expect(screen.getByText("Sample")).toHaveClass("text-foreground")
  })

  it("CommandDialog has an accessible name", () => {
    render(
      <CommandDialog open title="Search locations">
        <CommandInput placeholder="Search" />
      </CommandDialog>,
    )
    expect(screen.getByRole("dialog", { name: "Search locations" })).toBeInTheDocument()
  })

  it("CommandDialog forwards props to the inner Command", () => {
    render(
      <CommandDialog open commandProps={{ shouldFilter: false, label: "Locations" }}>
        <CommandInput placeholder="Search" />
        <CommandList>
          <CommandItem>Safeway on Main St</CommandItem>
        </CommandList>
      </CommandDialog>,
    )
    fireEvent.change(screen.getByPlaceholderText("Search"), { target: { value: "94110" } })
    // With filtering off, an item that doesn't contain the query stays visible.
    expect(screen.getByText("Safeway on Main St")).toBeVisible()
  })

  it("CommandEmpty keeps its base styles when given a className", () => {
    render(
      <Command>
        <CommandList>
          <CommandEmpty className="text-muted-foreground">Nothing</CommandEmpty>
        </CommandList>
      </Command>,
    )
    expect(screen.getByText("Nothing")).toHaveClass("py-6", "text-center", "text-muted-foreground")
  })

  it("ToggleGroupItem's own variant wins over the group's", () => {
    render(
      <ToggleGroup type="single" variant="outline">
        <ToggleGroupItem value="a">A</ToggleGroupItem>
        <ToggleGroupItem value="b" variant="default">B</ToggleGroupItem>
      </ToggleGroup>,
    )
    expect(screen.getByRole("radio", { name: "A" })).toHaveClass("border")
    expect(screen.getByRole("radio", { name: "B" })).not.toHaveClass("border")
  })

  it("Badge renders inline, so it can sit inside a paragraph", () => {
    render(<p>Status <Badge>Live</Badge></p>)
    expect(screen.getByText("Live").tagName).toBe("SPAN")
  })
})
