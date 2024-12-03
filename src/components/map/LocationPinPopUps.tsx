import type { FC } from "react"
import { Popup } from "react-map-gl"
import { useMapContext } from "@/components/providers/MapContextProvider"

export const LocationPinPopUps: FC = () => {
  const mapContext = useMapContext()
  const { pins, selectedLocation, setSelectedLocation } = mapContext

  return (
    <>
      {selectedLocation !== null && (
        <Popup
          longitude={pins[selectedLocation].longitude}
          latitude={pins[selectedLocation].latitude}
          anchor="top"
          onClose={() => setSelectedLocation(null)}
        >
          <div>
            <h3>{pins[selectedLocation].retailer}</h3>
            <p>{pins[selectedLocation].address}</p>
            <p>
              {pins[selectedLocation].city}, {pins[selectedLocation].state}
            </p>
            <button
              className="mt-2 bg-blue-500 text-white px-4 py-2 rounded"
              onClick={() =>
                alert(`Details for ${pins[selectedLocation].machineID}`)
              }
            >
              View Details
            </button>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                `${pins[selectedLocation].address}, ${pins[selectedLocation].city}, ${pins[selectedLocation].state}`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 text-blue-500 underline block"
            >
              Open in Google Maps
            </a>
          </div>
        </Popup>
      )}
    </>
  )
}
