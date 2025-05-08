"use client"

import type { FC, Dispatch, SetStateAction } from "react"
import { useContext, createContext, useState } from "react"

export interface AdContextProviderProps {
  children: React.ReactNode
}

export interface AdContextType {
  showBanner: boolean
  setShowBanner: Dispatch<SetStateAction<boolean>>
}

const AdContext = createContext<AdContextType | undefined>(undefined)

export const AdContextProvider: FC<AdContextProviderProps> = ({
  children,
}) => {
  const [showBanner, setShowBanner] = useState(true)

  return (
    <AdContext.Provider
      value={{ showBanner, setShowBanner }}
    >
      {children}
    </AdContext.Provider>
  )
}

export const useAdContext = (): AdContextType => {
  const context = useContext(AdContext)
  if (!context) {
    throw new Error("useAdContext must be used within a MapContextProvider")
  }
  return context
}