import type { FC, SetStateAction, Dispatch } from "react"
import { useState, useEffect, useMemo, useRef } from "react"
import {
  Source,
  Layer,
  Marker,
  useMap,
  type MapboxGeoJSONFeature,
} from "react-map-gl"
import type { LayerProps } from "react-map-gl"
import LocationPopup, { LocationPopupProps } from "./LocationPinPopUps"
import type { Point } from "geojson"
import { MapLayerMouseEvent } from "mapbox-gl"
import type {
  LocationFeature,
  LocationFeatureCollection,
  LocationFeatureProperties,
} from "@/lib/types/locations"

interface PokemonCenterLocationPinsProps {
  collection: LocationFeatureCollection
  clickedInfo: Omit<
    LocationPopupProps,
    "onClose"
  > | null
  setClickedInfo: Dispatch<SetStateAction<Omit<
    LocationPopupProps,
    "onClose"
  > | null>>
}

const CLUSTER_MAX_ZOOM = 8

const clusterCircleLayer: LayerProps = {
  id: "cluster-circle",
  type: "circle",
  source: "machines",
  filter: ["has", "point_count"],
  maxzoom: CLUSTER_MAX_ZOOM + 1,
  paint: {
    "circle-color": [
      "step",
      ["get", "point_count"],
      "#51bbd6",
      10,
      "#f1f075",
      30,
      "#f28cb1",
    ],
    "circle-radius": ["step", ["get", "point_count"], 15, 10, 20, 30, 25],
    "circle-stroke-width": 2,
    "circle-stroke-color": "#fff",
    "circle-opacity": 0.8,
  },
}

const clusterCountLayer: LayerProps = {
  id: "cluster-count",
  type: "symbol",
  source: "machines",
  filter: ["has", "point_count"],
  minzoom: 0,
  maxzoom: CLUSTER_MAX_ZOOM + 1,
  layout: {
    "text-field": "{point_count_abbreviated}",
    "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
    "text-size": 17,
    "text-allow-overlap": true,
    "text-ignore-placement": true,
    "text-offset": [0, 0.55],
    "text-anchor": "bottom",
  },
}

const unclusteredLayer: LayerProps = {
  id: "unclustered-temp",
  type: "circle",
  source: "machines",
  filter: ["!", ["has", "point_count"]],
  paint: {
    "circle-radius": 0.1,
    "circle-opacity": 0,
  },
}

export const PokemonCenterLocationPins: FC<PokemonCenterLocationPinsProps> = ({ collection, clickedInfo, setClickedInfo }) => {
  const mapRef = useMap()
  const [unclusteredPoints, setUnclusteredPoints] = useState<LocationFeature[]>([])


  const canHover = typeof window !== 'undefined'
    && window.matchMedia('(hover: hover) and (pointer: fine)').matches
  
  const [hoveredInfo, setHoveredInfo] = useState<Omit<
    LocationPopupProps,
    "onClose"
  > | null>(null)
  const leaveTimeout = useRef<number | null>(null)

  const clearHide = () => {
    if (leaveTimeout.current) {
      clearTimeout(leaveTimeout.current)
      leaveTimeout.current = null
    }
  }

  const scheduleHide = () => {
    clearHide()
    leaveTimeout.current = window.setTimeout(() => {
      setHoveredInfo(null)
    }, 200)
  }

  useEffect(() => {
    if (!mapRef.current) return
    const map = mapRef.current.getMap()

    const handleClusterClick = (e: MapLayerMouseEvent) => {
      const [lng, lat] = (e.features![0].geometry as GeoJSON.Point).coordinates
      map.easeTo({
        center: [lng, lat],
        zoom: CLUSTER_MAX_ZOOM + 1,
        duration: 2000,
      })
    }
    const handleClusterEnter = () => (map.getCanvas().style.cursor = "pointer")
    const handleClusterLeave = () => (map.getCanvas().style.cursor = "")

    map.on("click", "cluster-circle", handleClusterClick)
    ;["cluster-circle", "cluster-count"].forEach((layer) => {
      map.on("mouseenter", layer, handleClusterEnter)
      map.on("mouseleave", layer, handleClusterLeave)
    })

    return () => {
      map.off("click", "cluster-circle", handleClusterClick)
      ;["cluster-circle", "cluster-count"].forEach((layer) => {
        map.off("mouseenter", layer, handleClusterEnter)
        map.off("mouseleave", layer, handleClusterLeave)
      })
    }
  }, [mapRef])

  useEffect(() => {
    if (!mapRef.current) return
    const map = mapRef.current.getMap()

    const updateUnclustered = () => {
      if (!map.isStyleLoaded()) return

      const raw = map.querySourceFeatures("machines", {
        filter: ["!", ["has", "point_count"]],
      }) as MapboxGeoJSONFeature[]

      const onlyPoints = raw.filter(
        (f): f is MapboxGeoJSONFeature & { geometry: Point } =>
          f.geometry.type === "Point"
      )

      // querySourceFeatures returns a feature once per tile it touches, so a
      // machine near a tile edge can appear twice. Keep one per id.
      const byId = new Map<string, LocationFeature>()
      for (const f of onlyPoints) {
        const properties = f.properties as LocationFeatureProperties
        if (byId.has(properties.id)) continue
        byId.set(properties.id, {
          type: "Feature",
          geometry: { type: "Point", coordinates: f.geometry.coordinates },
          properties,
        })
      }

      setUnclusteredPoints([...byId.values()])
    }

    updateUnclustered()
    map.on("idle", updateUnclustered)
    return () => {
      map.off("idle", updateUnclustered)
    }
  }, [mapRef])

  const renderedSource = useMemo(() => {
    return (
      <Source
        id="machines"
        type="geojson"
        data={collection}
        promoteId="id"
        cluster
        clusterMaxZoom={CLUSTER_MAX_ZOOM}
        clusterRadius={30}
      >
        <Layer {...clusterCircleLayer} />
        <Layer {...clusterCountLayer} />
        <Layer {...unclusteredLayer} />
      </Source>
    )
  }, [collection])

  const activeInfo = clickedInfo || hoveredInfo

  return (
    <>
      {renderedSource}

      {unclusteredPoints.map((feature) => {
        const [longitude, latitude] = feature.geometry.coordinates
        const { id, retailer, machineID, address, city, state } =
          feature.properties

        const isActive = clickedInfo?.id === id || hoveredInfo?.id === id

        return (
          <Marker
            key={id}
            longitude={longitude}
            latitude={latitude}
            anchor="bottom"
            onClick={(e) => {
              e.originalEvent.stopPropagation()
              setClickedInfo({
                longitude,
                latitude,
                retailer,
                address,
                city,
                state,
                machineID,
                id,
              })
            }}
          >
            <img
              src="/pointer.png"
              alt="Poké-point"
              {...(canHover && {
                onMouseEnter: () => {
                  clearHide()
                  setHoveredInfo({
                    longitude,
                    latitude,
                    retailer,
                    address,
                    city,
                    state,
                    machineID,
                    id,
                  })
                },
                onMouseLeave: scheduleHide,
              })}
              className={`
                w-9 h-9
                origin-bottom
                transform transition-transform duration-200 ease-out
                cursor-pointer
                ${isActive ? "scale-110 z-50" : "md:hover:scale-110 md:hover:z-50"}
              `}
            />
          </Marker>
        )
      })}

      {activeInfo && (
        <LocationPopup
          {...activeInfo}
          onClose={() => {
            setClickedInfo(null)
            setHoveredInfo(null)
            clearHide()
          }}
          onMouseEnter={clearHide}
          onMouseLeave={scheduleHide}
        />
      )}
    </>
  )
}
