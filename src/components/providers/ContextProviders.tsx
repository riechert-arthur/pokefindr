import { MapContextProvider } from "./MapContextProvider"
import type { FC, ReactNode } from "react"
import { AdContextProvider } from "./AdContextProvider"

interface ContextProvidersProps {
  children: ReactNode
}

export const ContextProviders: FC<ContextProvidersProps> = ({ children }) => {
  return (
    <MapContextProvider>
      <AdContextProvider>{children}</AdContextProvider>
    </MapContextProvider>
  )
}
