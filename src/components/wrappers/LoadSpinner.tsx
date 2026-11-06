import type { FC } from "react"

interface LoadSpinnerProps {
  text: string
}

export const LoadSpinner: FC<LoadSpinnerProps> = ({ text }) => {
  return (
    <div className="flex flex-col justify-center items-center w-screen h-screen bg-muted/50">
      <h1 className="text-2xl font-semibold text-primary mb-4">{text}</h1>
      <div className="w-16 h-16 border-4 border-primary border-solid rounded-full border-t-transparent animate-spin" />
    </div>
  )
}
