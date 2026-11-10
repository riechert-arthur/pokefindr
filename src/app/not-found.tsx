import "./globals.css"
import { fontVariables } from "@/app/fonts"
import { RootNotFound } from "@/components/RootNotFound"
import { ThemeProvider } from "@/components/providers/ThemeProvider"

/**
 * A 404 outside any language's pages (an address the middleware doesn't see,
 * like a missing file), so it renders its own <html>, in English, with the
 * same fonts and theme as the app.
 */
export default function NotFound() {
  return (
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider>
          <main>
            <RootNotFound />
          </main>
        </ThemeProvider>
      </body>
    </html>
  )
}
