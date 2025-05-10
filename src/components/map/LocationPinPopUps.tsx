import React from "react"
import { Popup } from "react-map-gl"

export interface LocationPopupProps {
  longitude: number
  latitude: number
  retailer: string
  address: string
  city: string
  state: string
  machineID: string
  onClose: () => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}

export const LocationPopup: React.FC<LocationPopupProps> = ({
  longitude,
  latitude,
  retailer,
  address,
  city,
  state,
  machineID,
  onClose,
  onMouseEnter,
  onMouseLeave,
}) => (
  <Popup
    className="shadow-md rounded-xl"
    longitude={longitude}
    latitude={latitude}
    anchor="top"
    onClose={onClose}
    closeButton={false}
  >
    <div
      className="p-2"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <h3 className="font-semibold">{retailer}</h3>
      <p>{address}</p>
      <p>
        {city}, {state}
      </p>
      <button
        className="mt-2 bg-blue-500 text-white px-4 py-2 rounded"
        onClick={() => alert(`Details for ${machineID}`)}
      >
        View Details
      </button>
      <a
        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          `${address}, ${city}, ${state}`
        )}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 block underline text-blue-500"
      >
        Open in Google Maps
      </a>
    </div>
  </Popup>
)

export default LocationPopup
