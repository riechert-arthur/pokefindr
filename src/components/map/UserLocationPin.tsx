import { useUserLocationContext } from "@/components/providers/UserLocationContextProvider"
import type { FC } from "react"
import { Marker } from "react-map-gl"
import { UserLocationPinIcon } from "@/components/icons/UserLocationPinIcon"

export const UserLocationPin: FC = () => {
  const userLocationContext = useUserLocationContext()
  const { userLocation, userLocationError } = userLocationContext 

  if (!userLocation || userLocationError ) {
    console.log("No user location returned!") 
    return null
  }

  return (
    <Marker
      longitude={userLocation.longitude}
      latitude={userLocation.latitude}
      anchor="bottom"
    >
      <UserLocationPinIcon width="48px" height="48px" />
    </Marker>
  )
}
