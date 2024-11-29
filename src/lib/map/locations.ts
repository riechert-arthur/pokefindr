import { PokemonCenterLocation } from "@/lib/types/locations";
import { pokemonCenterLocations } from "../data/locations";

export async function getPokemonCenterLocations(): Promise<PokemonCenterLocation[]> {
    return Promise.resolve(pokemonCenterLocations)
}