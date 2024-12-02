import type { FC } from "react"
import { useRef, useEffect } from "react"
import { useMapContext } from "@/components/providers/MapContextProvider"
import { Marker } from "react-map-gl"
import PokeballPinIcon from "@/components/icons/PokeballPinIcon"



export const PokemonCenterLocationPins: FC = () => {
    const mapContext = useMapContext()
    const { pins, selectedLocation, setSelectedLocation } = mapContext

    const pinRefs = useRef<(HTMLDivElement | null)[]>([])

    const scalePin = (index: number, scale: number) => {
        const pin = pinRefs.current[index];
        if (pin) {
            pin.style.transform = `scale(${scale})`
            pin.style.transition = "transform 0.2s"
        }
    }

    useEffect(() => {
        pins.forEach((_, index) => {
            if (index === selectedLocation) {
                scalePin(index, 1.8)
            } else {
                scalePin(index, 1)
            }
        })
    }, [selectedLocation])

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
                        onMouseEnter={(e) => {
                          e.stopPropagation()
                          setSelectedLocation(index)
                        }}
                        className={`size-6 flex items-center justify-center cursor-pointer`}
                        ref={(el) => {pinRefs.current[index] = el}}
                    >
                        <PokeballPinIcon />
                    </div>
                </Marker>
          ))}
        </>
    )
}
