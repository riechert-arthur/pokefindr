import { redirect } from "next/navigation"

/** /admin opens the review queue until the admin shell (#152) gives it a home page. */
export default function AdminPage() {
  redirect("/admin/review")
}
