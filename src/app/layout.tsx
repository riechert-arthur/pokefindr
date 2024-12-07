import "./globals.css"
import { ContextProviders } from "@/components/providers/ContextProviders"
import homePageMetadata from "./metadata.json"
import { Footer } from "@/components/Footer"

export const metadata = homePageMetadata

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <ContextProviders>
          <main>
            {children}
          </main> 
          <Footer />
        </ContextProviders>
      </body>
    </html>
  )
}
