import { extendTailwindMerge } from "tailwind-merge"

/**
 * tailwind-merge, told about our custom type scale: without this it reads
 * text-body or text-caption as a color and drops a text-foreground next to it.
 * Keep the list in sync with theme.extend.fontSize in tailwind.config.ts.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["display", "title", "heading", "subheading", "body-lg", "body", "caption", "overline"] }],
    },
  },
})

/** Joins class names, and when two conflict, the later one wins (rounded-full then rounded-lg → rounded-lg). */
export function cn(...classes: (string | undefined | null | false)[]) {
  return twMerge(...classes)
}
