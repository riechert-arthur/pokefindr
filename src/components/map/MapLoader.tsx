"use client"

import type { FC } from "react"
import dynamic from "next/dynamic"
import { LoadSpinner } from "@/components/LoadSpinner"

const MapInstance = dynamic(() => import("./MapInstance"), {
    loading: () => <LoadSpinner text="Loading map..." />,
    ssr: false,
})

export const MapLoader: FC = () => {
    return (
        <MapInstance />
    )
}