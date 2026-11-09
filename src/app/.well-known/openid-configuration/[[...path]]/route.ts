import { discoveryPreflight, openIdConfiguration } from "@/server/auth/discovery"

export const dynamic = "force-dynamic"

export const GET = openIdConfiguration
export const OPTIONS = discoveryPreflight
