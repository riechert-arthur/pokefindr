import type { ComponentProps } from "react"
import { Button } from "@/components/ui/Button"
import { Loader2 } from "lucide-react"

export function LoadingButton({
  children,
  ...props
}: ComponentProps<"button">) {
  return (
    <Button {...props} disabled type="submit">
      <Loader2 className="animate-spin" />
      {children}
    </Button>
  )
}
