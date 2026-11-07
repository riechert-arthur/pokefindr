"use client"

import { type FC } from "react"
import { SidebarLayout } from "@/components/SidebarLayout"
import ChangelogModal from "@/components/ChangelogModal"
import { SidebarProvider } from "@/components/providers/SidebarContextProvider"

const DashboardLayout: FC<Readonly<{
  children: React.ReactNode
}>> = ({ children }) => {

  return (
    <>
      <ChangelogModal />
      <SidebarProvider>
        <SidebarLayout>
          { children }
        </SidebarLayout>
      </SidebarProvider>
    </>
  )

}

export default DashboardLayout 
