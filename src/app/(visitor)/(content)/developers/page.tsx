import type { Metadata } from "next"
import type { ReactNode } from "react"
import Link from "next/link"
import { CopyBlock } from "@/components/developers/CopyBlock"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MCP_ACCOUNT_PATH } from "@/lib/mcp/scopes"
import { getServerConfig } from "@/server/config"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "PokeFindr for developers: use it from Claude, ChatGPT and Cursor",
  description: "Connect PokeFindr's MCP server to Claude, ChatGPT, Cursor, VS Code or any MCP client to find Pokémon card vending machines, card shops and events.",
  alternates: { canonical: "/developers" },
}

// The URLs come from APP_URL, like the MCP routes and the OAuth audience, so each deployment shows its own.
export const dynamic = "force-dynamic"

const origin = () => new URL(getServerConfig().APP_URL).origin

/** A full-width band with a top rule, as the landing sections. */
function Band({ id, title, intro, children, first = false }: { id: string; title: string; intro?: ReactNode; children: ReactNode; first?: boolean }) {
  return (
    <section aria-labelledby={id} className={cn("px-6 py-[56px]", !first && "border-t border-border")}>
      <div className="mx-auto max-w-[1040px]">
        {first ? (
          <h1 id={id} className="text-balance text-title text-foreground">
            {title}
          </h1>
        ) : (
          <h2 id={id} className="text-balance text-title text-foreground">
            {title}
          </h2>
        )}
        {intro && <p className="mt-2.5 max-w-[65ch] text-body-lg text-muted-foreground">{intro}</p>}
        <div className="mt-8">{children}</div>
      </div>
    </section>
  )
}

const card = "min-w-0 rounded-xl border border-border bg-card p-5"

const READ_TOOLS = [
  ["find_places", "Vending machines, card shops and events near a US city or address, or in a state. Up to 10, closest first."],
  ["area_stats", "How many of each kind an area has, the top retailers and the top cities."],
  ["plan_route", "Puts 2 to 9 places in a sensible order, with a Google Maps directions link."],
  ["list_events", "Upcoming card shows, league nights and restocks, soonest or nearest first."],
  ["get_place", "One place's details and a summary of its reviews."],
] as const

const ACCOUNT_TOOLS = [
  ["my_reviews", "Your reviews, newest first."],
  ["my_submissions", "The shops and events you've submitted, and whether each is pending, approved or not approved."],
  ["submit_place", "Adds a card shop or event for a moderator to check, as you."],
] as const

function ToolList({ tools }: { tools: readonly (readonly [string, string])[] }) {
  return (
    <dl className="grid gap-3">
      {tools.map(([name, text]) => (
        <div key={name} className="grid gap-1 sm:grid-cols-[160px_1fr] sm:gap-4">
          <dt className="font-mono text-caption text-foreground">{name}</dt>
          <dd className="text-body text-muted-foreground">{text}</dd>
        </div>
      ))}
    </dl>
  )
}

function Steps({ children }: { children: ReactNode }) {
  return <ol className="grid list-decimal gap-2 pl-5 text-body text-muted-foreground marker:text-foreground">{children}</ol>
}

/**
 * /developers (#135): connecting PokeFindr's MCP server (#133, #134) to
 * common clients, and what it can do. Linked from the footer.
 */
export default function DevelopersPage() {
  const site = origin()
  const publicUrl = `${site}/api/mcp`
  const accountUrl = `${site}${MCP_ACCOUNT_PATH}`
  const json = (v: unknown) => JSON.stringify(v, null, 2)
  const clients = [
    {
      id: "claude",
      label: "Claude",
      body: (
        <Steps>
          <li>In Claude (web or desktop), open Settings, then Connectors.</li>
          <li>Add a custom connector named PokeFindr, with the URL below.</li>
          <li>For the account URL, Claude opens PokeFindr to log in and approve it.</li>
        </Steps>
      ),
      snippet: { label: "URL", text: publicUrl },
    },
    {
      id: "claude-code",
      label: "Claude Code",
      body: <p className="text-body text-muted-foreground">Run this in a terminal. Use the account URL instead to sign in (run /mcp in Claude Code to finish).</p>,
      snippet: { label: "Command", text: `claude mcp add --transport http pokefindr ${publicUrl}` },
    },
    {
      id: "chatgpt",
      label: "ChatGPT",
      body: (
        <Steps>
          <li>In ChatGPT, open Settings, then Apps &amp; Connectors, and turn on developer mode under Advanced.</li>
          <li>Create a connector named PokeFindr with the URL below.</li>
          <li>For the account URL, choose OAuth: ChatGPT opens PokeFindr to log in and approve it.</li>
        </Steps>
      ),
      snippet: { label: "URL", text: publicUrl },
    },
    {
      id: "cursor",
      label: "Cursor",
      body: <p className="text-body text-muted-foreground">Add this to ~/.cursor/mcp.json (or .cursor/mcp.json in a project).</p>,
      snippet: { label: "Config", text: json({ mcpServers: { pokefindr: { url: publicUrl } } }), multiline: true },
    },
    {
      id: "vscode",
      label: "VS Code",
      body: <p className="text-body text-muted-foreground">Add this to .vscode/mcp.json, or run MCP: Add Server from the command palette.</p>,
      snippet: { label: "Config", text: json({ servers: { pokefindr: { type: "http", url: publicUrl } } }), multiline: true },
    },
    {
      id: "other",
      label: "Other clients",
      body: <p className="text-body text-muted-foreground">Any client that speaks Streamable HTTP works, on the 2025 or 2026-07-28 protocol. Sessions aren&apos;t used, so each request stands alone.</p>,
      snippet: { label: "URL", text: publicUrl },
    },
  ]

  return (
    <div className="pt-24">
      <Band
        id="dev-title"
        first
        title="Use PokeFindr from your AI assistant"
        intro="PokeFindr runs an MCP server, so Claude, ChatGPT, Cursor and other MCP clients can find Pokémon card vending machines, card shops and events for you. Every answer links back to the map."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <article className={cn(card, "flex flex-col gap-3")}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-subheading text-foreground">Public</h3>
              <Badge variant="secondary">No sign-in</Badge>
            </div>
            <p className="text-body text-muted-foreground">Search, counts, routes and events. Nothing to set up.</p>
            <CopyBlock text={publicUrl} label="URL" className="mt-auto" />
          </article>
          <article className={cn(card, "flex flex-col gap-3")}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-subheading text-foreground">Your account</h3>
              <Badge variant="outline">Log in</Badge>
            </div>
            <p className="text-body text-muted-foreground">Everything above, plus your reviews and submissions, and adding a shop or event. You approve each app once.</p>
            <CopyBlock text={accountUrl} label="URL" className="mt-auto" />
          </article>
        </div>
      </Band>

      <Band id="setup-title" title="Set it up" intro="Pick your client. The snippets use the public URL; swap in the account URL to sign in.">
        <Tabs defaultValue="claude">
          <TabsList className="h-auto flex-wrap justify-start">
            {clients.map((c) => (
              <TabsTrigger key={c.id} value={c.id}>
                {c.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {clients.map((c) => (
            <TabsContent key={c.id} value={c.id} className="mt-4">
              {/* The card is inside: a display class on the panel itself would show the hidden ones. */}
              <div className={cn(card, "grid gap-4")}>
                {c.body}
                <CopyBlock text={c.snippet.text} label={c.snippet.label} multiline={c.snippet.multiline} />
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </Band>

      <Band id="tools-title" title="What it can do" intro="Ask in plain words, like “Where can I buy Pokémon cards near Denver?” or “Plan a route through the three closest machines to Seattle.”">
        <div className="grid gap-4 lg:grid-cols-2">
          <article className={cn(card, "grid content-start gap-4")}>
            <h3 className="text-subheading text-foreground">Everyone</h3>
            <ToolList tools={READ_TOOLS} />
          </article>
          <article className={cn(card, "grid content-start gap-4")}>
            <h3 className="text-subheading text-foreground">With your account</h3>
            <ToolList tools={ACCOUNT_TOOLS} />
          </article>
        </div>
      </Band>

      <Band id="limits-title" title="Limits and privacy">
        <ul className="grid max-w-[70ch] list-disc gap-2 pl-5 text-body text-muted-foreground">
          <li>Each client can send 30 requests a minute and see 200 different places a day. The map has every place, with no limit.</li>
          <li>Each answer has up to 10 places. Names, addresses and reviews are written by PokeFindr users.</li>
          <li>Connecting your account never shares your password. You see what an app asks for before you allow it, and you can disconnect it from the app.</li>
          <li>Places you submit wait for a moderator, like ones added on the map. You can submit five a day.</li>
        </ul>
        <p className="mt-6 text-body text-muted-foreground">
          Questions or ideas? Ask on{" "}
          <Link href="https://discord.gg/f2uUR5bAZU" className="text-foreground underline underline-offset-4">
            Discord
          </Link>
          .
        </p>
      </Band>
    </div>
  )
}
