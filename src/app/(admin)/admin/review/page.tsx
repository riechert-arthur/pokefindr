import { redirect } from "next/navigation"

/** The review queue's old address (R4): now a section of /admin. */
export default function ReviewQueueRedirect() {
  redirect("/admin")
}
