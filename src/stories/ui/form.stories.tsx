import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod/v3"
import { Button } from "@/components/ui/button"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"

const schema = z.object({ name: z.string().min(2, "Add a name so people can recognize it.") })

function ExampleForm() {
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { name: "" } })
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(() => {})} className="w-80 space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Shop name</FormLabel>
              <FormControl><Input placeholder="Store name" {...field} /></FormControl>
              <FormDescription>As it appears on the sign.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Review</Button>
      </form>
    </Form>
  )
}

const meta = { title: "UI/Form", component: ExampleForm } satisfies Meta<typeof ExampleForm>
export default meta
export const Validation: StoryObj<typeof meta> = {}
