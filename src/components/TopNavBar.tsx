import type { FC } from "react"
import { PokeFindrIcon } from "@/components/icons/PokeFindrIcon"
import Link from "next/link"

export const TopNavBar: FC = () => {
  return (
    <div className="absolute flex items-center px-3 top-3 left-1/2 transform -translate-x-1/2 bg-transparent w-[100vw] h-[3vh] rounded-full z-10 fshadow-lg">
      <Link className="flex items-center" href="/">
        <PokeFindrIcon width={25} height={25} />
        <span className="text-lg font-bold text-gray-800 ml-2 tracking-wide">
          PokeFindr
        </span>
      </Link>
      
    </div>
  )
}
