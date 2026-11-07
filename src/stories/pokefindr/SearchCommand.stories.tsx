import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { fn } from "storybook/test"
import { useState } from "react"
import { MapIcon, MapPinIcon } from "lucide-react"
import { SearchCommand, type SearchCommandItem, type SearchCommandStatus } from "@/components/pokefindr/SearchCommand"
import { KindDot } from "@/components/pokefindr/KindDot"

const pin = <MapPinIcon aria-hidden className="size-4 shrink-0" />

const DENVER: SearchCommandItem[] = [
  { id: "a0", group: "areas", label: "Denver, CO", meta: "50 places within 10 mi", icon: pin },
  { id: "a1", group: "areas", label: "Denton, TX", meta: "2 places within 10 mi", icon: pin },
  { id: "a2", group: "areas", label: "Denison, TX", meta: "0 places within 10 mi", icon: pin },
  { id: "a3", group: "areas", label: "Colorado", meta: "64 places", icon: <MapIcon aria-hidden className="size-4 shrink-0" /> },
  { id: "l0", group: "locations", label: "King Soopers", detail: "1155 E 9th Ave, Denver", meta: "Vending machine", icon: <KindDot kind="vending" /> },
  { id: "l1", group: "locations", label: "Den of Cards", detail: "1 Pearl St, Boulder", meta: "Card shop", icon: <KindDot kind="shop" /> },
]

/** Type in the box to open the list; it shows the same results for any query. */
function Interactive({ variant, items, status, initial = "" }: { variant: "hero" | "panel"; items: SearchCommandItem[]; status: SearchCommandStatus; initial?: string }) {
  const [query, setQuery] = useState(initial)
  return (
    <div className={variant === "hero" ? "w-[620px] max-w-full" : "w-[360px] max-w-full"}>
      <SearchCommand
        variant={variant}
        query={query}
        onQueryChange={setQuery}
        items={items}
        status={status}
        onPick={fn()}
        onClear={variant === "panel" ? () => setQuery("") : undefined}
        placeholder={variant === "hero" ? "City or address, like Denver, CO" : "Search city or address"}
      />
    </div>
  )
}

const meta = {
  title: "PokeFindr/SearchCommand",
  component: SearchCommand,
  parameters: { layout: "padded" },
  args: { query: "", onQueryChange: fn(), items: DENVER, status: "ready", onPick: fn(), placeholder: "Search city or address" },
} satisfies Meta<typeof SearchCommand>
export default meta
type Story = StoryObj<typeof meta>

/** The map's search box. */
export const Panel: Story = { render: () => <Interactive variant="panel" items={DENVER} status="ready" initial="Den" /> }
/** The landing hero's: bigger, with a Search button. */
export const Hero: Story = { render: () => <Interactive variant="hero" items={DENVER.filter((i) => i.group === "areas")} status="ready" initial="Den" /> }
export const Searching: Story = { render: () => <Interactive variant="panel" items={[]} status="loading" initial="Denv" /> }
export const NoMatches: Story = { render: () => <Interactive variant="panel" items={[]} status="ready" initial="qqzx" /> }
export const SearchDown: Story = { render: () => <Interactive variant="panel" items={[]} status="error" initial="Denver" /> }
