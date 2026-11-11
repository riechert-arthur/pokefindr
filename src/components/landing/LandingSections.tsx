import type { ReactNode } from "react"
import { KindDot } from "@/components/pokefindr/KindDot"
import { StatusBadge } from "@/components/pokefindr/StatusBadge"
import { KIND_ORDER, type LocationKind } from "@/components/pokefindr/kinds"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { FAQ_IDS, FAQ_LINKS, faqAnswer } from "@/lib/faq"
import { cn } from "@/lib/utils"
import { useFormat } from "@/i18n/format"
import { useTranslations } from "next-intl"

/** A full-width band with a top rule, as the prototype's landing sections. */
function Band({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className="border-t border-border px-6 py-[72px]">
      <div className={cn("mx-auto max-w-[1040px]", className)}>{children}</div>
    </section>
  )
}

const card = "min-w-0 rounded-xl border border-border bg-card p-5"

const STEPS = ["search", "nearby", "directions"] as const

/** "From your city to the machine in three steps". */
export function HowItWorks() {
  const t = useTranslations("landing.how")
  return (
    <Band id="how-title">
      <h2 id="how-title" className="text-balance text-title text-foreground">{t("title")}</h2>
      <p className="mt-2.5 max-w-[60ch] text-body-lg text-muted-foreground">{t("intro")}</p>
      <ol className="mt-9 grid gap-4 md:grid-cols-3">
        {STEPS.map((step, i) => (
          <li key={step} className={card}>
            <span aria-hidden className="mb-3.5 grid size-7 place-items-center rounded-full bg-foreground text-body font-bold text-background">
              {i + 1}
            </span>
            <h3 className="mb-1.5 text-subheading text-foreground">{t(`steps.${step}.title`)}</h3>
            <p className="text-body text-muted-foreground">{t(`steps.${step}.text`)}</p>
          </li>
        ))}
      </ol>
    </Band>
  )
}

/** "More than vending machines": each kind, live, with its count once it has places. */
export function LocationTypes({ counts }: { counts: Partial<Record<LocationKind, number>> | null }) {
  const f = useFormat()
  const t = useTranslations("landing.kinds")
  const tk = useTranslations("kinds")
  return (
    <Band id="kinds-title">
      <h2 id="kinds-title" className="text-balance text-title text-foreground">{t("title")}</h2>
      <p className="mt-2.5 max-w-[60ch] text-body-lg text-muted-foreground">{t("intro")}</p>
      <div className="mt-9 grid gap-4 md:grid-cols-3">
        {KIND_ORDER.map((kind) => {
          const n = counts?.[kind] ?? 0
          return (
            <article key={kind} className={cn(card, "flex flex-col gap-2.5")}>
              <div className="flex items-center justify-between">
                <KindDot kind={kind} size="lg" className="size-9 rounded-[10px] [&_svg]:size-[18px]" />
                <StatusBadge status="live" />
              </div>
              <h3 className="text-subheading text-foreground">
                {tk(`${kind}.label`)}
                {n > 0 && ` · ${f.count(n)}`}
              </h3>
              <p className="text-body text-muted-foreground">{t(kind)}</p>
            </article>
          )
        })}
      </div>
    </Band>
  )
}

/** The FAQ: the title on the left (sticky on desktop), the questions in an accordion on the right. */
export function FaqSection() {
  const t = useTranslations("faq")
  return (
    <Band id="faq-title" className="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] md:gap-12">
      <div className="md:sticky md:top-6">
        <h2 id="faq-title" className="text-balance text-title text-foreground">{t("title")}</h2>
        <p className="mt-2.5 text-body-lg text-muted-foreground">
          {t.rich("intro", {
            link: (chunks) => (
              <a href={FAQ_LINKS.support} className="text-primary underline underline-offset-4">
                {chunks}
              </a>
            ),
          })}
        </p>
      </div>
      <Accordion type="single" collapsible defaultValue={FAQ_IDS[0]} className="border-t border-border">
        {FAQ_IDS.map((id) => (
          <AccordionItem key={id} value={id} className="border-border">
            <AccordionTrigger className="gap-3 px-0.5 py-4 text-subheading text-foreground hover:no-underline">{t(`items.${id}.question`)}</AccordionTrigger>
            {/* Mounted while closed (and hidden), so every answer is in the page's HTML: crawlers see the same text as the FAQPage data. */}
            <AccordionContent forceMount className="max-w-[65ch] px-0.5 pb-[18px] text-body text-muted-foreground">
              {faqAnswer(t, id, (tag, chunks) => (
                <a href={FAQ_LINKS[tag]} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">
                  {chunks}
                </a>
              ))}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </Band>
  )
}
