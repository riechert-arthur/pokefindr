import "./globals.css"
import { RootNotFound } from "@/components/RootNotFound"

/**
 * A 404 outside any language's pages (an address the middleware doesn't see,
 * like a missing file), so it renders its own <html>, in English.
 */
export default function NotFound() {
  return (
    <html lang="en">
      <body className="antialiased">
        <main>
          <RootNotFound />
        </main>
      </body>
    </html>
  )
}
