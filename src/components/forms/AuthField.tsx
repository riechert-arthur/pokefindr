"use client"

import type { ComponentProps, ReactNode } from "react"
import type { Control, FieldPath, FieldValues } from "react-hook-form"
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"

type AuthFieldProps<Values extends FieldValues> = Omit<ComponentProps<typeof Input>, "name"> & {
  control: Control<Values>
  name: FieldPath<Values>
  label: string
  /** Shown at the end of the label's row, like Login's "Forgot your password?" link. */
  labelExtra?: ReactNode
}

/**
 * One text input in an auth form: its label, the input, and the validation
 * message under it. Any other props (type, placeholder, autoComplete) go to
 * the input.
 */
export function AuthField<Values extends FieldValues>({ control, name, label, labelExtra, ...inputProps }: AuthFieldProps<Values>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <div className="grid gap-3">
            {labelExtra ? (
              <div className="flex items-center">
                <FormLabel>{label}</FormLabel>
                {labelExtra}
              </div>
            ) : (
              <FormLabel>{label}</FormLabel>
            )}
            <FormControl>
              <Input {...inputProps} {...field} />
            </FormControl>
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
