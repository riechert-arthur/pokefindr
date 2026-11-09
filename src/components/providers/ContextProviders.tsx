import type { FC, ReactNode } from "react"
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
        {/* One provider for every Tooltip, so delays and skip-delay are shared. */}
        <TooltipProvider>{children}</TooltipProvider>
      </SessionContextProvider>
    </NuqsAdapter>
  )
}
