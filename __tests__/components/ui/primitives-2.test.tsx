import React from "react"
import { describe, expect, it } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

describe("shadcn primitives (batch 2)", () => {
  it("Accordion expands an item", () => {
    render(
      <Accordion type="single" collapsible>
        <AccordionItem value="a">
          <AccordionTrigger>What is a Pokémon vending machine?</AccordionTrigger>
          <AccordionContent>An automated retail machine.</AccordionContent>
        </AccordionItem>
      </Accordion>,
    )
    const trigger = screen.getByRole("button", { name: "What is a Pokémon vending machine?" })
    expect(trigger).toHaveAttribute("aria-expanded", "false")
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText("An automated retail machine.")).toBeInTheDocument()
  })

  it("Tabs switch panels from the keyboard", async () => {
    render(
      <Tabs defaultValue="results">
        <TabsList>
          <TabsTrigger value="results">Results</TabsTrigger>
          <TabsTrigger value="highlights">Highlights</TabsTrigger>
        </TabsList>
        <TabsContent value="results">Results panel</TabsContent>
        <TabsContent value="highlights">Highlights panel</TabsContent>
      </Tabs>,
    )
    const results = screen.getByRole("tab", { name: "Results" })
    expect(results).toHaveAttribute("aria-selected", "true")
    expect(screen.getByText("Results panel")).toBeInTheDocument()

    // Arrow keys move focus along the tab list, and focus selects the tab.
    results.focus()
    fireEvent.keyDown(results, { key: "ArrowRight" })
    const highlights = screen.getByRole("tab", { name: "Highlights" })
    // Radix moves focus in a setTimeout.
    await waitFor(() => expect(highlights).toHaveFocus())
    expect(highlights).toHaveAttribute("aria-selected", "true")
    expect(screen.getByText("Highlights panel")).toBeInTheDocument()
    expect(screen.queryByText("Results panel")).not.toBeInTheDocument()
  })

  it("RadioGroup selects one option", () => {
    render(
      <RadioGroup defaultValue="free" aria-label="Entry">
        <RadioGroupItem value="free" aria-label="Free" />
        <RadioGroupItem value="paid" aria-label="Paid" />
      </RadioGroup>,
    )
    expect(screen.getByRole("radio", { name: "Free" })).toBeChecked()
    fireEvent.click(screen.getByRole("radio", { name: "Paid" }))
    expect(screen.getByRole("radio", { name: "Paid" })).toBeChecked()
  })

  it("Separator, Skeleton and Textarea render with tokens", () => {
    render(
      <>
        <Separator decorative={false} />
        <Skeleton data-testid="sk" />
        <Textarea aria-label="Review" />
      </>,
    )
    expect(screen.getByRole("separator")).toHaveClass("bg-border")
    expect(screen.getByTestId("sk")).toHaveClass("bg-primary/10")
    expect(screen.getByRole("textbox", { name: "Review" })).toHaveClass("border-input")
  })
})
