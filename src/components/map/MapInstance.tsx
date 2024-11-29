"use client"

import type { FC } from "react"
import { useEffect } from "react"
import Map from "react-map-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import { getPokemonCenterLocations } from "@/lib/map/locations"
import type { PokemonCenterLocation } from "@/lib/types/locations"
import { useMapContext } from "@/components/providers/MapContextProvider"
import { PokemonCenterLocationPins } from "./PokemonCenterLocationPins"
import { LocationPinPopUps } from "./LocationPinPopUps"

export const MapInstance: FC = () => {
    const mapContext = useMapContext()
    const { setPins } = mapContext

    useEffect(() => {
        const fetchCoordinates = async () => {
            try {
                const locations: PokemonCenterLocation[] = await getPokemonCenterLocations()
                const promises = locations.map(async (location) => {
                    const { address, city, state } = location
                    const fullAddress = `${address}, ${city}, ${state}`
                    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
                        fullAddress
                    )}.json?access_token=${process.env.NEXT_PUBLIC_MAPBOXGL_API_KEY}`

                    const response = await fetch(url)
                    const data = await response.json()
                    const [longitude, latitude] = data.features[0]?.center || []
                    return { ...location, longitude, latitude }
                })
                const results = await Promise.all(promises);
                setPins(results.filter((pin) => pin && pin.latitude && pin.longitude))
            } catch (error) {
                throw error
            }
        }

        fetchCoordinates()
    }, [])

    return (
        <Map
            mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOXGL_API_KEY}
            initialViewState={{
                longitude: -84.39,
                latitude: 33.76,
                zoom: 8,
            }}
            style={{ width: "100vw", height: "100vh" }}
            mapStyle="mapbox://styles/mapbox/streets-v12"
        >
            <PokemonCenterLocationPins />
            <LocationPinPopUps />
        </Map>
    )
}