import { Loader2 } from "lucide-react"
import { Button, type ButtonProps } from "@/components/ui/button"

type LoadingButtonProps = ButtonProps & {
  /** True while the button's action runs. */
  pending: boolean
  /** What the button says while pending, like "Signing in…". */
  pendingLabel: string
}

/**
 * A button for an action that takes a moment. While pending it is disabled
 * and shows a spinner and pendingLabel instead of its children. It stays the
 * same element either way, so the form doesn't swap one button for another.
 */
export function LoadingButton({ pending, pendingLabel, disabled, children, ...props }: LoadingButtonProps) {
  return (
    <Button {...props} disabled={pending || disabled}>
      {pending && <Loader2 className="animate-spin" />}
      {pending ? pendingLabel : children}
    </Button>
  )
}
