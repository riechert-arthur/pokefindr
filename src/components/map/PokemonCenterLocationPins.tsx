import type { FC } from "react"
import { useMapContext } from "@/components/providers/MapContextProvider"
import { Marker } from "react-map-gl"
import PokeballPinIcon from "@/components/icons/PokeballPinIcon"

export const PokemonCenterLocationPins: FC = () => {
    const mapContext = useMapContext()
    const { pins, setSelectedLocation } = mapContext

    return (
        <>
            {pins.map((pin, index) => (
                <Marker
                key={index}
                longitude={pin.longitude}
                latitude={pin.latitude}
                anchor="bottom"
                >
                    <div
                        onClick={(e) => {
                        e.stopPropagation()
                        setSelectedLocation(index)
                        }}
                        className="size-10 flex items-center justify-center cursor-pointer"
                    >
                        <PokeballPinIcon />
                    </div>
                </Marker>
          ))}
        </>
    )
}