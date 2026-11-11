import { headers } from "next/headers"
import { HomeDashboard } from "@/components/dashboard/HomeDashboard"

/** /home: the dashboard and its assistant. The middleware only lets signed-in users here and says who they are. */
export default async function HomePage() {
  return <HomeDashboard userId={(await headers()).get("x-user-id")} />
}
