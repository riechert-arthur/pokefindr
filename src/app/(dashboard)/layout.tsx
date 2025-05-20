"use client"

import { type FC } from "react"
import { SidebarLayout } from "@/components/SidebarLayout"
import { UserLocationContextProvider } from "@/components/providers/UserLocationContextProvider"
import ChangelogModal from "@/components/ChangelogModal"
import { SidebarProvider } from "@/components/providers/SidebarContextProvider"

const DashboardLayout: FC<Readonly<{
  children: React.ReactNode
}>> = ({ children }) => {

  return (
    <UserLocationContextProvider>
      <ChangelogModal />
      <SidebarProvider>
        <SidebarLayout>
          { children }
        </SidebarLayout>
      </SidebarProvider>
    </UserLocationContextProvider>
  )

}

export default DashboardLayout 
