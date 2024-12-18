"use client"

import { FC, ReactNode, useState } from "react"
import { PokeFindrIcon } from "@/components/icons/PokeFindrIcon"
import Link from "next/link"
import {
  ChevronDoubleRightIcon,
  ChevronDoubleLeftIcon,
} from "@heroicons/react/24/outline"

interface SidebarLayoutProps {
  children: ReactNode
}

export const SidebarLayout: FC<SidebarLayoutProps> = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  const toggleSidebar = () => setIsSidebarOpen((prev) => !prev)

  return (
    <div className="flex h-screen relative">
      <aside
        className={`absolute top-0 left-0 h-full bg-white shadow-lg z-10 flex flex-col px-4 py-6 transform transition-transform duration-300 overflow-hidden ${
          isSidebarOpen ? "translate-x-0 w-48" : "-translate-x-full w-0"
        } sm:translate-x-0 sm:w-48`}
      >
        <div
          className={`flex flex-col transition-opacity duration-300 h-full ${
            isSidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"
          } sm:opacity-100 sm:pointer-events-auto`}
        >
          <Link className="flex items-center mb-6" href="/">
            <PokeFindrIcon width={30} height={30} />
            <span className="text-xl font-bold text-gray-800 ml-3 tracking-wide">
              PokeFindr
            </span>
          </Link>
          <nav className="flex flex-col space-y-4 w-full">
            <Link
              href="/"
              className="text-gray-700 font-medium hover:text-indigo-600 hover:bg-gray-100 rounded-lg px-3 py-2 transition"
            >
              Home
            </Link>
            <Link
              href="/blog"
              className="text-gray-700 font-medium hover:text-indigo-600 hover:bg-gray-100 rounded-lg px-3 py-2 transition"
            >
              Blog
            </Link>
          </nav>
          <div className="mt-auto w-full">
            <p className="text-gray-500 text-sm text-center">
              &copy; 2024 PokeFindr
            </p>
          </div>
        </div>
      </aside>
      <button
        className={`absolute top-4 z-20 bg-white p-2 rounded-md shadow-md transform transition-transform duration-300 ${
          isSidebarOpen ? "left-52" : "left-4"
        } sm:hidden`}
        onClick={toggleSidebar}
      >
        {isSidebarOpen ? (
          <ChevronDoubleLeftIcon width={12} height={12} />
        ) : (
          <ChevronDoubleRightIcon width={12} height={12} />
        )}
      </button>
      <main
        className={`flex-1 bg-gray-50 overflow-auto transform transition-all duration-300 ${
          isSidebarOpen ? "ml-48" : "ml-0"
        } sm:ml-48`}
      >
        {children}
      </main>
    </div>
  )
}
