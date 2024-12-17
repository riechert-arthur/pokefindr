import type { FC, ReactNode } from "react";
import { PokeFindrIcon } from "@/components/icons/PokeFindrIcon";
import Link from "next/link";

interface SidebarLayoutProps {
  children: ReactNode;
}

export const SidebarLayout: FC<SidebarLayoutProps> = ({ children }) => {
  return (
    <div className="flex h-screen">
      <aside className="fixed top-0 left-0 h-full w-48 bg-white shadow-lg z-10 flex flex-col items-start px-4 py-6">
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
          <p className="text-gray-500 text-sm text-center">&copy; 2024 PokeFindr</p>
        </div>
      </aside>
      <main className="ml-48 flex-1 bg-gray-50 overflow-auto">
        {children}
      </main>
    </div>
  )
}