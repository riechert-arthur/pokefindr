import type { Metadata } from "next"
import type { ReactNode } from "react"
import { Link } from "@/i18n/navigation"
import { CopyBlock, type SnippetKind } from "@/components/developers/CopyBlock"
import { SUPPORT_URL } from "@/components/ErrorPage"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MCP_ACCOUNT_PATH } from "@/lib/mcp/scopes"
import { getServerConfig } from "@/server/config"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"
import { getTranslations } from "next-intl/server"
import type { LocaleParams } from "@/i18n/static"
import type { Locale } from "@/i18n/routing"
import { pageMetadata } from "@/i18n/seo"

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale: locale as Locale, namespace: "content.developers.meta" })
  return pageMetadata("/developers", locale as Locale, { title: t("title"), description: t("description") })
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

// The MCP tools, by name; what each does is in the catalog (`content.developers.tools.<name>`).
const READ_TOOLS = ["find_places", "area_stats", "plan_route", "list_events", "get_place"] as const
const ACCOUNT_TOOLS = ["my_reviews", "my_submissions", "submit_place"] as const

function ToolList({ tools }: { tools: readonly (typeof READ_TOOLS[number] | typeof ACCOUNT_TOOLS[number])[] }) {
  const t = useTranslations("content.developers.tools")
  return (
    <dl className="grid gap-3">
      {tools.map((name) => (
        <div key={name} className="grid gap-1 sm:grid-cols-[160px_1fr] sm:gap-4">
          <dt className="font-mono text-caption text-foreground">{name}</dt>
          <dd className="text-body text-muted-foreground">{t(name)}</dd>
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
  const t = useTranslations("content.developers")
  const site = origin()
  const publicUrl = `${site}/api/mcp`
  const accountUrl = `${site}${MCP_ACCOUNT_PATH}`
  const json = (v: unknown) => JSON.stringify(v, null, 2)
  const clients: { id: string; label: string; body: ReactNode; snippet: { kind: SnippetKind; text: string; multiline?: boolean } }[] = [
    {
      id: "claude",
      label: "Claude",
      body: (
        <Steps>
          <li>{t("setup.claude.settings")}</li>
          <li>{t("setup.claude.add")}</li>
          <li>{t("setup.claude.account")}</li>
        </Steps>
      ),
      snippet: { kind: "url", text: publicUrl },
    },
    {
      id: "claude-code",
      label: "Claude Code",
      body: <p className="text-body text-muted-foreground">{t("setup.claudeCode")}</p>,
      snippet: { kind: "command", text: `claude mcp add --transport http pokefindr ${publicUrl}` },
    },
    {
      id: "chatgpt",
      label: "ChatGPT",
      body: (
        <Steps>
          <li>{t("setup.chatgpt.settings")}</li>
          <li>{t("setup.chatgpt.add")}</li>
          <li>{t("setup.chatgpt.account")}</li>
        </Steps>
      ),
      snippet: { kind: "url", text: publicUrl },
    },
    {
      id: "cursor",
      label: "Cursor",
      body: <p className="text-body text-muted-foreground">{t("setup.cursor")}</p>,
      snippet: { kind: "config", text: json({ mcpServers: { pokefindr: { url: publicUrl } } }), multiline: true },
    },
    {
      id: "vscode",
      label: "VS Code",
      body: <p className="text-body text-muted-foreground">{t("setup.vscode")}</p>,
      snippet: { kind: "config", text: json({ servers: { pokefindr: { type: "http", url: publicUrl } } }), multiline: true },
    },
    {
      id: "other",
      label: t("setup.other"),
      body: <p className="text-body text-muted-foreground">{t("setup.otherClients")}</p>,
      snippet: { kind: "url", text: publicUrl },
    },
  ]

  return (
    <div className="pt-24">
      <Band
        id="dev-title"
        first
        title={t("title")}
        intro={t("intro")}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <article className={cn(card, "flex flex-col gap-3")}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-subheading text-foreground">{t("public.title")}</h3>
              <Badge variant="secondary">{t("public.badge")}</Badge>
            </div>
            <p className="text-body text-muted-foreground">{t("public.body")}</p>
            <CopyBlock text={publicUrl} kind="url" className="mt-auto" />
          </article>
          <article className={cn(card, "flex flex-col gap-3")}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-subheading text-foreground">{t("account.title")}</h3>
              <Badge variant="outline">{t("account.badge")}</Badge>
            </div>
            <p className="text-body text-muted-foreground">{t("account.body")}</p>
            <CopyBlock text={accountUrl} kind="url" className="mt-auto" />
          </article>
        </div>
      </Band>

      <Band id="setup-title" title={t("setup.title")} intro={t("setup.intro")}>
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
                <CopyBlock text={c.snippet.text} kind={c.snippet.kind} multiline={c.snippet.multiline} />
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </Band>

      <Band id="tools-title" title={t("tools.title")} intro={t("tools.intro")}>
        <div className="grid gap-4 lg:grid-cols-2">
          <article className={cn(card, "grid content-start gap-4")}>
            <h3 className="text-subheading text-foreground">{t("tools.everyone")}</h3>
            <ToolList tools={READ_TOOLS} />
          </article>
          <article className={cn(card, "grid content-start gap-4")}>
            <h3 className="text-subheading text-foreground">{t("tools.withAccount")}</h3>
            <ToolList tools={ACCOUNT_TOOLS} />
          </article>
        </div>
      </Band>

      <Band id="limits-title" title={t("limits.title")}>
        <ul className="grid max-w-[70ch] list-disc gap-2 pl-5 text-body text-muted-foreground">
          <li>{t("limits.rate")}</li>
          <li>{t("limits.answers")}</li>
          <li>{t("limits.password")}</li>
          <li>{t("limits.submissions")}</li>
        </ul>
        <p className="mt-6 text-body text-muted-foreground">
          {t.rich("limits.questions", {
            link: (chunks) => (
              <Link href={SUPPORT_URL} className="text-foreground underline underline-offset-4">
                {chunks}
              </Link>
            ),
          })}
        </p>
      </Band>
    </div>
  )
}
