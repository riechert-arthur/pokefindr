import type { FC, ReactNode } from "react"
import { AdContextProvider } from "./AdContextProvider"
import { SessionContextProvider } from "./SessionProvider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { NuqsAdapter } from "nuqs/adapters/next/app"

interface ContextProvidersProps {
  children: ReactNode
}

export const ContextProviders: FC<ContextProvidersProps> = ({ children }) => {
  return (
    <NuqsAdapter>
      <SessionContextProvider>
        <AdContextProvider>
          {/* One provider for every Tooltip, so delays and skip-delay are shared. */}
          <TooltipProvider>{children}</TooltipProvider>
        </AdContextProvider>
      </SessionContextProvider>
    </NuqsAdapter>
  )
}
