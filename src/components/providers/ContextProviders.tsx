import { MapContextProvider } from "./MapContextProvider"
import type { FC, ReactNode } from "react"

interface ContextProvidersProps {
  children: ReactNode
}

export const ContextProviders: FC<ContextProvidersProps> = ({ children }) => {
  return <MapContextProvider>{children}</MapContextProvider>
}
