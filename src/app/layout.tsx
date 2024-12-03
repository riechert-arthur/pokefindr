import "./globals.css"
import { ContextProviders } from "@/components/providers/ContextProviders"

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <ContextProviders>{children}</ContextProviders>
      </body>
    </html>
  )
}
