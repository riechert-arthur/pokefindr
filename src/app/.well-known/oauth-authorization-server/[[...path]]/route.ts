import { discoveryPreflight, authorizationServerMetadata } from "@/server/auth/discovery"

export const dynamic = "force-dynamic"

export const GET = authorizationServerMetadata
export const OPTIONS = discoveryPreflight
