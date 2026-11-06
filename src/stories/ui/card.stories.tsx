import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

const meta = { title: "UI/Card", component: Card } satisfies Meta<typeof Card>
export default meta

export const Default: StoryObj<typeof meta> = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>QFC</CardTitle>
        <CardDescription>1401 Broadway, Seattle, WA</CardDescription>
      </CardHeader>
      <CardContent className="text-body text-muted-foreground">Machine Q00245 · 0.4 mi away</CardContent>
      <CardFooter className="gap-2">
        <Button size="sm">Directions</Button>
        <Button size="sm" variant="outline">Copy link</Button>
      </CardFooter>
    </Card>
  ),
}
