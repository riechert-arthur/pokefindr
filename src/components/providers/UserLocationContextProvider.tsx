"use client"

import type { FC, ReactNode } from "react"
import { useEffect, useState, createContext, useContext } from "react"

export interface UserLocation {
  latitude: number
  longitude: number
}

export interface UserLocationContextType {
  userLocation: UserLocation | null
  userLocationError: string
}

interface UserLocationContextProviderProps {
  children: ReactNode
}

export const UserLocationContext = createContext<
  UserLocationContextType | undefined
>(undefined)

export const UserLocationContextProvider: FC<
  UserLocationContextProviderProps
> = ({ children }) => {
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null)
  const [userLocationError, setUserLocationError] = useState<string>("")

  useEffect(() => {
    if (!navigator.geolocation) {
      setUserLocationError("Geolocation is not supported by your browser")
      return
    }

    const success = (position: GeolocationPosition) => {
      const { latitude, longitude } = position.coords
      setUserLocation({ latitude, longitude })
    }

    const failure = (err: GeolocationPositionError) => {
      setUserLocationError(`Failed to retrieve location: ${err.message}`)
    }

    navigator.geolocation.getCurrentPosition(success, failure)
  }, [])

  return (
    <UserLocationContext.Provider value={{ userLocation, userLocationError }}>
      {children}
    </UserLocationContext.Provider>
  )
}

export const useUserLocationContext = (): UserLocationContextType => {
  const context = useContext(UserLocationContext)
  if (!context) {
    throw new Error("useMapContext must be used within a MapContextProvider")
  }
  return context
}
