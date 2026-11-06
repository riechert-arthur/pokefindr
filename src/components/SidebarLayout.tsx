"use client"

import { FC, ReactNode } from 'react'
import Link from 'next/link'
import { Logo } from "@/components/brand/Logo"
import { useSidebar } from '@/components/providers/SidebarContextProvider'
import { DiscordIcon } from './icons/DiscordIcon'
import { useSessionContext } from './providers/SessionProvider'
import { BookOpenIcon, ChevronLeft, HouseIcon, MapPinIcon, SettingsIcon } from 'lucide-react'
import { ThemeToggle } from '@/components/pokefindr/ThemeToggle'

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
          `fixed inset-y-0 left-0 bg-card shadow-xl z-50
          flex flex-col items-center py-4 gap-6 w-16
          transform transition-transform duration-300
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          sm:translate-x-0
          overflow-hidden`
        }
      >
        <Link href="/" aria-label="Home">
          <Logo size={28} />
        </Link>
        <nav className="flex flex-col space-y-6">
          <Link href="/home" aria-label="Home" className="p-2 hover:bg-muted rounded-md">
            <HouseIcon className="size-6 text-muted-foreground" />
          </Link>
          <Link href="/blog" aria-label="Blog" className="p-2 hover:bg-muted rounded-md">
            <BookOpenIcon className="size-6 text-muted-foreground" />
          </Link>
          <Link href="/map" aria-label="Map"  className="p-2 hover:bg-muted rounded-md">
            <MapPinIcon className="size-6 text-muted-foreground" />
          </Link>
          <Link href="https://discord.gg/f2uUR5bAZU" aria-label="Discord" target="_blank" className="p-2 hover:bg-muted rounded-md">
            <DiscordIcon className="size-6 text-muted-foreground" />
          </Link>
          {session && (
           <Link href="/settings" aria-label="Settings"  className="p-2 hover:bg-muted rounded-md">
            <SettingsIcon className="size-6 text-muted-foreground" />
          </Link> 
          )} 
        </nav>
        <ThemeToggle variant="toggle" className="mt-auto" />
      </aside>

      {isSidebarOpen && <button
        onClick={toggleSidebar}
        className="
          absolute top-4 left-[5rem]    
          p-2 bg-card rounded-full shadow-md
          z-50
        "
      >
        <ChevronLeft
          className={`
            w-5 h-5 text-muted-foreground
            transform transition-transform duration-200
            ${isSidebarOpen ? '' : 'rotate-180'}
          `}
        />
      </button>}

      <main className="z-10 flex-1 bg-muted/50 dark:bg-background overflow-auto">
        {children}
      </main>
    </div>
  )
}
