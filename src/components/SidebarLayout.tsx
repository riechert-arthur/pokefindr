"use client"

import { FC, ReactNode } from 'react'
import Link from 'next/link'
import { PokeFindrIcon } from '@/components/icons/PokeFindrIcon'
import { HomeIcon, BookOpenIcon } from '@heroicons/react/24/outline'
import { useSidebar } from '@/components/providers/SidebarContextProvider'
import { DiscordIcon } from './icons/DiscordIcon'

interface SidebarLayoutProps {
  children: ReactNode
}

export const SidebarLayout: FC<SidebarLayoutProps> = ({ children }) => {
  const { isSidebarOpen } = useSidebar()

  return (
    <div className="relative h-screen">
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
          <Link href="/" aria-label="Home" className="p-2 hover:bg-gray-100 rounded-md">
            <HomeIcon className="w-6 h-6 text-gray-600" />
          </Link>
          <Link href="/blog" aria-label="Blog" className="p-2 hover:bg-gray-100 rounded-md">
            <BookOpenIcon className="w-6 h-6 text-gray-600" />
          </Link>
          <Link href="https://discord.gg/f2uUR5bAZU" aria-label="Discord" target="_blank" className="p-2 hover:bg-gray-100 rounded-md">
            <DiscordIcon className="w-6 h-6 text-gray-600 font-semibold" />
          </Link>
        </nav>
      </aside>

      <main className="flex-1 bg-gray-50 overflow-auto">
        {children}
      </main>
    </div>
  )
}