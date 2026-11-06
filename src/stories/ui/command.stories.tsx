import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { MapPinIcon } from "lucide-react"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command"

const meta = { title: "UI/Command", component: Command } satisfies Meta<typeof Command>
export default meta
export const Search: StoryObj<typeof meta> = {
  render: () => (
    <Command className="w-96 rounded-xl border shadow-md">
      <CommandInput placeholder="Search city or address" />
      <CommandList>
        <CommandEmpty>No match. Try a city with locations, like Denver.</CommandEmpty>
        <CommandGroup heading="Areas">
          <CommandItem><MapPinIcon /> Seattle, WA <span className="ml-auto text-caption text-muted-foreground">41 within 10 mi</span></CommandItem>
          <CommandItem><MapPinIcon /> Denver, CO <span className="ml-auto text-caption text-muted-foreground">53 within 10 mi</span></CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Locations">
          <CommandItem>QFC · 1401 Broadway</CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
}
