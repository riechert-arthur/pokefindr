import { PokemonCenterLocation } from "@/lib/types/locations"
import { db } from "@/lib/supabase/db"

export async function getPokemonCenterLocations(): Promise<
  PokemonCenterLocation[]
> {
  const { data } = await db
    .from("Vending Machine Locations")
    .select("retailer, machineID, address, city, state, longitude, latitude")
  return data || []
}
