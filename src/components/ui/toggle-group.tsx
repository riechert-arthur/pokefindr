"use client"

import * as React from "react"
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group"
import { type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { toggleVariants } from "@/components/ui/toggle"

const ToggleGroupContext = React.createContext<
  VariantProps<typeof toggleVariants>
>({
  size: "default",
  variant: "default",
})

type ToggleGroupProps = React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root> &
  VariantProps<typeof toggleVariants> & {
    /**
     * For a controlled type="single" group that must always have a value (a
     * radius picker): clicking the pressed item doesn't clear it.
     */
    required?: boolean
  }

const ToggleGroup = React.forwardRef<React.ElementRef<typeof ToggleGroupPrimitive.Root>, ToggleGroupProps>(
  ({ className, variant, size, children, required, ...props }, ref) => {
    const context = React.useMemo(() => ({ variant, size }), [variant, size])
    const rootProps =
      required && props.type === "single"
        ? { ...props, onValueChange: (value: string) => value && props.onValueChange?.(value) }
        : props
    return (
      <ToggleGroupPrimitive.Root
        ref={ref}
        className={cn("flex items-center justify-center gap-1", className)}
        {...rootProps}
      >
        <ToggleGroupContext.Provider value={context}>{children}</ToggleGroupContext.Provider>
      </ToggleGroupPrimitive.Root>
    )
  },
)

ToggleGroup.displayName = ToggleGroupPrimitive.Root.displayName

const ToggleGroupItem = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item> &
    VariantProps<typeof toggleVariants>
>(({ className, children, variant, size, ...props }, ref) => {
  const context = React.useContext(ToggleGroupContext)

  return (
    <ToggleGroupPrimitive.Item
      ref={ref}
      className={cn(
        toggleVariants({
          // An item's own variant/size wins over the group's.
          variant: variant ?? context.variant,
          size: size ?? context.size,
        }),
        className
      )}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  )
})

ToggleGroupItem.displayName = ToggleGroupPrimitive.Item.displayName

export { ToggleGroup, ToggleGroupItem }
