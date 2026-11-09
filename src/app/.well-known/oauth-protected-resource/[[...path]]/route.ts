import { discoveryPreflight, protectedResourceMetadata } from "@/server/auth/discovery"

export const dynamic = "force-dynamic"

export const GET = protectedResourceMetadata
export const OPTIONS = discoveryPreflight
