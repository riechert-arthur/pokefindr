import type { ReactNode } from "react"

/** The compact pickers' trigger (the language and theme badges): 32px, caption text. */
export const COMPACT_TRIGGER = "h-8 w-auto gap-1.5 px-2 text-caption"

/**
 * A compact trigger's text. SelectTrigger clamps its direct child span to one
 * line, which would override a hiding class on the text (the app rail swaps
 * text as it expands), so the text sits one level down. The outer span can
 * shrink, so long text truncates inside the badge instead of pushing past it.
 */
export function CompactLabel({ children }: { children: ReactNode }) {
  return <span className="min-w-0 truncate">{children}</span>
}
