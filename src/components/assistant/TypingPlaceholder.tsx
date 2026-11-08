"use client"

import { useEffect, useState } from "react"

/** Example questions the empty composer types out, from the prototype. */
export const GHOST_PROMPTS = [
  "Vending machines within 5 miles of Portland",
  "Plan a route through 4 machines near Denver",
  "Which retailers have the most machines in Washington?",
  "What's the closest machine to me?",
  "Card shops near Seattle that sell singles",
  "Any events coming up near Phoenix?",
] as const

export const STILL_PLACEHOLDER = "Ask about machines, shops or events…"


/**
 * The composer's typing placeholder: each example types out, holds, erases,
 * and the next one starts, with a blinking caret. With reduced motion it's
 * plain text that doesn't move. Decorative: the textarea has its own label.
 */
export function TypingPlaceholder() {
  // Read after mounting, so the server and the first client render agree.
  const [still, setStill] = useState(false)
  useEffect(() => {
    setStill(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false)
  }, [])
  const [state, setState] = useState({ i: 0, pos: 0, phase: "type" as "type" | "hold" | "erase" })

  useEffect(() => {
    if (still) return
    const full = GHOST_PROMPTS[state.i]
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
    const t = setTimeout(() => setState(next), wait)
    return () => clearTimeout(t)
  }, [state, still])

  if (still) return <>{STILL_PLACEHOLDER}</>
  return (
    <>
      {GHOST_PROMPTS[state.i].slice(0, state.pos)}
      <span className="ml-px inline-block h-[1.15em] w-0.5 animate-caret-blink motion-reduce:animate-none bg-brand align-[-0.2em]" />
    </>
  )
}
