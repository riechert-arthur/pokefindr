"use client"

import type { FC, Dispatch, SetStateAction } from "react"
import { useContext, createContext, useState } from "react"
import { MapPin } from "@/lib/types/map"

export interface MapContextProviderProps {
    children: React.ReactNode
}

export interface MapContextType {
    pins: MapPin[]
    setPins: Dispatch<SetStateAction<MapPin[]>>
    selectedLocation: number | null
    setSelectedLocation: Dispatch<SetStateAction<number | null>>
}

const MapContext = createContext<MapContextType | undefined>(undefined)

export const MapContextProvider: FC<MapContextProviderProps> = ({ children }) => {
    const [pins, setPins] = useState<MapPin[]>([])
    const [selectedLocation, setSelectedLocation] = useState<number | null>(null)

    return (
        <MapContext.Provider value={{ pins, setPins, selectedLocation, setSelectedLocation }}>
            {children}
        </MapContext.Provider>
    )
}

export const useMapContext = (): MapContextType => {
    const context = useContext(MapContext)
    if (!context) {
        throw new Error("useMapContext must be used within a MapContextProvider")
    }
    return context
}
