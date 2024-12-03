import type { FC } from "react"
import { MapInstance } from "@/components/map/MapInstance"
import { TopNavBar } from "@/components/TopNavBar"
import Head from "next/head"

const HomePage: FC = () => {
  return (
    <>
      <Head>
        <title>
          Find all Pokemon Vending Machine Locations - Free Map | PokeFindr
        </title>
        <meta
          name="description"
          content="See a map with all the Pokemon Vending Machine Locations. Easily send the directions to Google Maps."
          key="desc"
        />
        <meta
          name="keywords"
          content="Pokemon vending machines, Pokemon map, vending machine locations, Pokemon merchandise map, PokeFindr"
        />
        <meta
          name="author"
          content="PokeFindr Developer"
        />
        <meta property="og:title" content="Find all Pokemon Vending Machine Locations | PokeFindr" />
        <meta
          property="og:description"
          content="Explore a comprehensive map of Pokemon Vending Machine Locations. Easily find directions to your nearest vending machine!"
        />
        <meta
          name="robots"
          content="index, follow"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta httpEquiv="Content-Type" content="text/html; charset=UTF-8" />
      </Head>
      <TopNavBar />
      <MapInstance />
    </>
  )
}

export default HomePage
