import type { FC, ReactNode } from "react"
import { AdContextProvider } from "./AdContextProvider"
import { SessionContextProvider } from "./SessionProvider"

interface ContextProvidersProps {
  children: ReactNode
}

export const ContextProviders: FC<ContextProvidersProps> = ({ children }) => {
  return (
    <SessionContextProvider>
      <AdContextProvider>{children}</AdContextProvider>
    </SessionContextProvider>
    
  )
}
