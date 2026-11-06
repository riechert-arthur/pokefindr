import { extendTailwindMerge } from "tailwind-merge"
import { FONT_SIZE } from "@/lib/design/type-scale"

/**
 * tailwind-merge, told about our custom type scale (the same object Tailwind
 * uses): without this it reads text-body or text-caption as a color and drops
 * a text-foreground next to it.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: Object.keys(FONT_SIZE) }],
    },
  },
})

/** Joins class names, and when two conflict, the later one wins (rounded-full then rounded-lg → rounded-lg). */
export function cn(...classes: (string | undefined | null | false)[]) {
  return twMerge(...classes)
}
