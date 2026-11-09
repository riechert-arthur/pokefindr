import { notFound } from "next/navigation"

/** Any other address in a language: its own 404 (not-found.tsx beside it), in that language. */
export default function CatchAll() {
  notFound()
}
