import type { FC } from "react"
import { cn } from "@/lib/utils"

interface LoadSpinnerProps {
  text: string
  /**
   * Fills the screen (a page of its own, like the login callback). In-app
   * pages pass false: they sit in the layout above the phone tab bar, so the
   * spinner fills its place there instead of making the page scroll.
   */
  fullScreen?: boolean
}

export const LoadSpinner: FC<LoadSpinnerProps> = ({ text, fullScreen = true }) => {
  return (
    <div className={cn("flex flex-col items-center justify-center bg-muted/50", fullScreen ? "h-screen w-screen" : "h-full min-h-48 w-full py-16")}>
      <h1 className="text-2xl font-semibold text-primary mb-4">{text}</h1>
      <div className="w-16 h-16 border-4 border-primary border-solid rounded-full border-t-transparent animate-spin" />
    </div>
  )
}
