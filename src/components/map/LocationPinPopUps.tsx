import type { FC } from "react"
import { ExternalLinkIcon } from "lucide-react"
import { Popup } from "./engine"
import { Button } from "@/components/ui/button"
import { KINDS, toKind } from "@/components/pokefindr/kinds"
import type { LocationKind } from "@/lib/types/locations"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"

/** The selected location, as the popup and the details panel show it. */
export interface LocationPopupProps {
  longitude: number
  latitude: number
  retailer: string
  address: string
  city: string
  state: string
  machineID: string
  /** Database id of the location. */
  id: string
  kind?: LocationKind
  onClose: () => void
  /** Opens the details panel. */
  onDetails?: () => void
}

/** The popup over a selected location, as in the redesign prototype. */
export const LocationPopup: FC<LocationPopupProps> = ({
  longitude,
  latitude,
  retailer,
  address,
  city,
  state,
  machineID,
  kind: rawKind,
  onClose,
  onDetails,
}) => {
  const kind = toKind(rawKind)
  const t = useTranslations("map.popup")
  const tk = useTranslations("kinds")
  const directions = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${retailer} ${address} ${city} ${state}`,
  )}`
  return (
    <Popup
      longitude={longitude}
      latitude={latitude}
      offset={14}
      maxWidth="280px"
      focusAfterOpen={false}
      closeOnClick={false}
      onClose={onClose}
    >
      <div className="font-sans">
        {/* The dot carries the kind's color; the words stay in the text color for contrast (#399). */}
        <div className="mb-1 inline-flex items-center gap-1.5 text-caption font-semibold text-foreground">
          <span className={cn("size-2 rounded-full", KINDS[kind].bg)} aria-hidden />
          {tk(`${kind}.name`)}
        </div>
        <h4 className="text-subheading text-foreground">{retailer}</h4>
        <p className="mt-0.5 text-body text-muted-foreground">{address}</p>
        <p className="mt-0.5 text-body text-muted-foreground">
          {city}, {state}
        </p>
        {machineID && <div className="mt-1.5 font-mono text-caption text-muted-foreground">{t("machine", { id: machineID })}</div>}
        <div className="mt-3 flex gap-1.5">
          {onDetails && (
            <Button size="sm" onClick={onDetails}>
              {t("details")}
            </Button>
          )}
          <Button size="sm" variant="outline" asChild>
            <a href={directions} target="_blank" rel="noopener noreferrer">
              {t("directions")} <ExternalLinkIcon className="size-3.5" aria-hidden />
            </a>
          </Button>
        </div>
      </div>
    </Popup>
  )
}

export default LocationPopup
