import type { ReactNode } from "react"
import { KindDot } from "@/components/pokefindr/KindDot"
import { StatusBadge } from "@/components/pokefindr/StatusBadge"
import { KIND_ORDER, KINDS, formatCount, type LocationKind } from "@/components/pokefindr/kinds"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { FAQS, answerParts } from "@/lib/faq"
import { cn } from "@/lib/utils"

/** A full-width band with a top rule, as the prototype's landing sections. */
function Band({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className="border-t border-border px-6 py-[72px]">
      <div className={cn("mx-auto max-w-[1040px]", className)}>{children}</div>
    </section>
  )
}

const card = "min-w-0 rounded-xl border border-border bg-card p-5"

const STEPS = [
  ["Search your city", "Type a city or address. Each suggestion shows how many locations are within 10 miles."],
  ["See what's nearby", "The map opens on your area with everything inside the radius, closest first. Widen it to 25 or 50 miles."],
  ["Get directions", "Open any location in Google Maps, or copy the page link to share the exact view with a friend."],
] as const

/** "From your city to the machine in three steps". */
export function HowItWorks() {
  return (
    <Band id="how-title">
      <h2 id="how-title" className="text-balance text-title text-foreground">From your city to the machine in three steps</h2>
      <p className="mt-2.5 max-w-[60ch] text-body-lg text-muted-foreground">No account needed. Search, look, and go.</p>
      <ol className="mt-9 grid gap-4 md:grid-cols-3">
        {STEPS.map(([title, text], i) => (
          <li key={title} className={card}>
            <span aria-hidden className="mb-3.5 grid size-7 place-items-center rounded-full bg-foreground text-body font-bold text-background">
              {i + 1}
            </span>
            <h3 className="mb-1.5 text-subheading text-foreground">{title}</h3>
            <p className="text-body text-muted-foreground">{text}</p>
          </li>
        ))}
      </ol>
    </Band>
  )
}

const KIND_COPY: Record<LocationKind, string> = {
  vending: "Official Pokémon card vending machines at Safeway, Kroger, Fred Meyer and more, from the Pokémon Center's retailer list.",
  shop: "Local game stores that sell singles and sealed product, with hours and links.",
  event: "Card shows, league nights and prerelease events, with dates on the map.",
}

/** "More than vending machines": each kind, live with its count or coming soon. */
export function LocationTypes({ counts }: { counts: Partial<Record<LocationKind, number>> | null }) {
  return (
    <Band id="kinds-title">
      <h2 id="kinds-title" className="text-balance text-title text-foreground">More than vending machines</h2>
      <p className="mt-2.5 max-w-[60ch] text-body-lg text-muted-foreground">The map is growing to cover the places collectors actually go.</p>
      <div className="mt-9 grid gap-4 md:grid-cols-3">
        {KIND_ORDER.map((kind) => {
          const n = counts?.[kind] ?? 0
          const live = n > 0
          return (
            <article key={kind} className={cn(card, "flex flex-col gap-2.5", !live && "border-dashed bg-transparent")}>
              <div className="flex items-center justify-between">
                <KindDot kind={kind} size="lg" className="size-9 rounded-[10px] [&_svg]:size-[18px]" />
                {live ? <StatusBadge status="live" /> : <StatusBadge status="coming-soon" />}
              </div>
              <h3 className="text-subheading text-foreground">
                {KINDS[kind].label}
                {live && ` · ${formatCount(n)}`}
              </h3>
              <p className="text-body text-muted-foreground">{KIND_COPY[kind]}</p>
            </article>
          )
        })}
      </div>
    </Band>
  )
}

/** The FAQ: the title on the left (sticky on desktop), the questions in an accordion on the right. */
export function FaqSection() {
  return (
    <Band id="faq-title" className="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] md:gap-12">
      <div className="md:sticky md:top-6">
        <h2 id="faq-title" className="text-balance text-title text-foreground">Frequently asked questions</h2>
        <p className="mt-2.5 text-body-lg text-muted-foreground">
          Something else? Ask on{" "}
          <a href="https://discord.gg/f2uUR5bAZU" className="text-primary underline underline-offset-4">
            Support
          </a>
          .
        </p>
      </div>
      <Accordion type="single" collapsible defaultValue={String(FAQS[0].id)} className="border-t border-border">
        {FAQS.map((f) => (
          <AccordionItem key={f.id} value={String(f.id)} className="border-border">
            <AccordionTrigger className="gap-3 px-0.5 py-4 text-subheading text-foreground hover:no-underline">{f.question}</AccordionTrigger>
            {/* Mounted while closed (and hidden), so every answer is in the page's HTML: crawlers, Ctrl-F and the FAQPage data see the same text. */}
            <AccordionContent forceMount className="max-w-[65ch] px-0.5 pb-[18px] text-body text-muted-foreground">
              {answerParts(f.answer).map((p, i) =>
                "href" in p ? (
                  <a key={i} href={p.href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">
                    {p.text}
                  </a>
                ) : (
                  <span key={i}>{p.text}</span>
                ),
              )}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </Band>
  )
}
