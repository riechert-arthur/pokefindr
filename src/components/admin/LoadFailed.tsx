import { TriangleAlertIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/pokefindr/EmptyState"

/** What an admin section shows when its list didn't load: "Couldn't load reports", with Try again. */
export function LoadFailed({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <EmptyState icon={TriangleAlertIcon} title={`Couldn't load ${what}`} action={<Button onClick={onRetry}>Try again</Button>}>
      Check your connection, then try again.
    </EmptyState>
  )
}
