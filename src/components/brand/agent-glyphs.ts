import { createLucideIcon, type LucideIcon } from "lucide-react"

/*
 * Candidate glyphs for the assistant's mark (#303), drawn in lucide's style
 * (24 × 24, 2 px round strokes, one color) from the logo's own shapes in
 * Logo.tsx. The pin here is the logo's pin scaled to 0.7.
 * AgentMark uses AgentPinIcon; the "PokeFindr/AgentMark → Options" story shows
 * all three so the direction can be picked. Delete the two that lose.
 */

/** The logo's pin outline (Logo.tsx's path, scaled to 0.7 and centered). */
const PIN = "M12 2c-4.48 0-8.05 3.5-8.05 7.91 0 5.53 6.65 11.62 7.35 12.18a.98.98 0 0 0 1.4 0c.7-.56 7.35-6.65 7.35-12.18C20.05 5.5 16.48 2 12 2z"

/** A: the logo's pin, talking. Its head holds three typing dots where the logo has the card. */
export const AgentPinIcon = createLucideIcon("AgentPin", [
  ["path", { d: PIN, key: "pin" }],
  ["circle", { cx: "8.5", cy: "10", r: "1.25", fill: "currentColor", stroke: "none", key: "dot1" }],
  ["circle", { cx: "12", cy: "10", r: "1.25", fill: "currentColor", stroke: "none", key: "dot2" }],
  ["circle", { cx: "15.5", cy: "10", r: "1.25", fill: "currentColor", stroke: "none", key: "dot3" }],
])

/** B: the logo's card, at its -10° tilt, as a speech bubble with two lines of text. */
export const AgentCardBubbleIcon = createLucideIcon("AgentCardBubble", [
  [
    "path",
    {
      d: "M7.5 3h9A2.5 2.5 0 0 1 19 5.5v10a2.5 2.5 0 0 1-2.5 2.5h-5l-4 3.5V18A2.5 2.5 0 0 1 5 15.5v-10A2.5 2.5 0 0 1 7.5 3z",
      transform: "rotate(-10 12 12)",
      key: "bubble",
    },
  ],
  ["path", { d: "M8.5 8.5h7", transform: "rotate(-10 12 12)", key: "line1" }],
  ["path", { d: "M8.5 12.5h4", transform: "rotate(-10 12 12)", key: "line2" }],
])

/** C: the logo in one color: the pin's outline holding its tilted card, filled. */
export const AgentPinCardIcon = createLucideIcon("AgentPinCard", [
  ["path", { d: PIN, key: "pin" }],
  ["rect", { x: "9", y: "5.6", width: "6", height: "8.2", rx: "1.2", fill: "currentColor", stroke: "none", transform: "rotate(-10 12 9.7)", key: "card" }],
])

/** The three directions, for the Options story. */
export const AGENT_GLYPHS: { name: string; description: string; icon: LucideIcon }[] = [
  { name: "A · Talking pin", description: "The logo's pin with typing dots in its head.", icon: AgentPinIcon },
  { name: "B · Card bubble", description: "The logo's tilted card as a speech bubble.", icon: AgentCardBubbleIcon },
  { name: "C · Pin and card", description: "The logo itself, in one color.", icon: AgentPinCardIcon },
]
