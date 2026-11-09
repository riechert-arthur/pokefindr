"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"

/** Example questions the empty composer types out, from the prototype (assistant.placeholder.prompts in the catalog). */
export const GHOST_PROMPTS = ["portland", "denver", "washington", "closest", "seattle", "phoenix"] as const


/**
 * The composer's typing placeholder: each example types out, holds, erases,
 * and the next one starts, with a blinking caret. With reduced motion it's
 * plain text that doesn't move. Decorative: the textarea has its own label.
 */
export function TypingPlaceholder() {
  const t = useTranslations("assistant.placeholder")
  // Read after mounting, so the server and the first client render agree.
  const [still, setStill] = useState(false)
  useEffect(() => {
    setStill(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false)
  }, [])
  const [state, setState] = useState({ i: 0, pos: 0, phase: "type" as "type" | "hold" | "erase" })

  useEffect(() => {
    if (still) return
    const full = t(`prompts.${GHOST_PROMPTS[state.i]}`)
    let wait = 38 + Math.random() * 40
    let next = state
    if (state.phase === "type") next = state.pos + 1 >= full.length ? { ...state, pos: full.length, phase: "hold" } : { ...state, pos: state.pos + 1 }
    else if (state.phase === "hold") {
      wait = 1700
      next = { ...state, phase: "erase" }
    } else {
      wait = 16
      const pos = Math.max(0, state.pos - 2)
      next = pos ? { ...state, pos } : { i: (state.i + 1) % GHOST_PROMPTS.length, pos: 0, phase: "type" }
      if (!pos) wait = 380
    }
    const timer = setTimeout(() => setState(next), wait)
    return () => clearTimeout(timer)
  }, [state, still, t])

  if (still) return <>{t("still")}</>
  return (
    <>
      {t(`prompts.${GHOST_PROMPTS[state.i]}`).slice(0, state.pos)}
      <span className="ml-px inline-block h-[1.15em] w-0.5 animate-caret-blink motion-reduce:animate-none bg-brand align-[-0.2em]" />
    </>
  )
}
