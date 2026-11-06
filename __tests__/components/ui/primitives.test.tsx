import React from "react"
import { describe, expect, it } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

describe("shadcn primitives (batch 1)", () => {
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

  it("Tooltip renders its trigger and opens on focus", async () => {
    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger>Locate</TooltipTrigger>
          <TooltipContent>Show my location</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    )
    fireEvent.focus(screen.getByRole("button", { name: "Locate" }))
    expect((await screen.findAllByText("Show my location")).length).toBeGreaterThan(0)
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
})
