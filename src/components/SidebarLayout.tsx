"use client"

import { FC, ReactNode } from 'react'
import Link from 'next/link'
import { PokeFindrIcon } from '@/components/icons/PokeFindrIcon'
import { HomeIcon, BookOpenIcon, MapPinIcon } from '@heroicons/react/24/outline'
import { useSidebar } from '@/components/providers/SidebarContextProvider'
import { DiscordIcon } from './icons/DiscordIcon'
import { useSessionContext } from './providers/SessionProvider'
import { ChevronLeft } from 'lucide-react'
import { Cog6ToothIcon } from '@heroicons/react/24/outline'

interface SidebarLayoutProps {
  children: ReactNode
}

export const SidebarLayout: FC<SidebarLayoutProps> = ({ children }) => {
  const { isSidebarOpen, toggleSidebar } = useSidebar()
  const { session } = useSessionContext()

  return (
    <div className="relative h-screen flex">
      <aside
        className={
          `fixed inset-y-0 left-0 bg-white shadow-xl z-50
          flex flex-col items-center py-4 space-y-6 w-16
          transform transition-transform duration-300
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          sm:translate-x-0
          overflow-hidden`
        }
      >
        <Link href="/" aria-label="Home">
          <PokeFindrIcon width={24} height={24} />
        </Link>
        <nav className="flex flex-col space-y-6">
          <Link href="/home" aria-label="Home" className="p-2 hover:bg-gray-100 rounded-md">
            <HomeIcon className="w-6 h-6 text-gray-600" />
          </Link>
          <Link href="/blog" aria-label="Blog" className="p-2 hover:bg-gray-100 rounded-md">
            <BookOpenIcon className="w-6 h-6 text-gray-600" />
          </Link>
          <Link href="/map" aria-label="Discord"  className="p-2 hover:bg-gray-100 rounded-md">
            <MapPinIcon className="w-6 h-6 text-gray-600 font-semibold" />
          </Link>
          <Link href="https://discord.gg/f2uUR5bAZU" aria-label="Discord" target="_blank" className="p-2 hover:bg-gray-100 rounded-md">
            <DiscordIcon className="w-6 h-6 text-gray-600 font-semibold" />
          </Link>
          {session && (
           <Link href="/settings" aria-label="Discord"  className="p-2 hover:bg-gray-100 rounded-md">
            <Cog6ToothIcon className="w-6 h-6 text-gray-600 font-semibold" />
          </Link> 
          )} 
        </nav>
        
      </aside>

      {isSidebarOpen && <button
        onClick={toggleSidebar}
        className="
          absolute top-4 left-[5rem]    
          p-2 bg-white rounded-full shadow-md
          z-50
        "
      >
        <ChevronLeft
          className={`
            w-5 h-5 text-gray-600
            transform transition-transform duration-200
            ${isSidebarOpen ? '' : 'rotate-180'}
          `}
        />
      </button>}

      <main className="z-10 flex-1 bg-gray-50 overflow-auto">
        {children}
      </main>
    </div>
  )
}
