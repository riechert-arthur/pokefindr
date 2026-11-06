import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"

const meta = { title: "UI/Accordion", component: Accordion } satisfies Meta<typeof Accordion>
export default meta
export const FAQ: StoryObj<typeof meta> = {
  args: { type: "single", collapsible: true, defaultValue: "a" },
  render: (args) => (
    <Accordion {...args} className="w-[32rem]">
      <AccordionItem value="a">
        <AccordionTrigger>What is a Pokémon vending machine?</AccordionTrigger>
        <AccordionContent>An automated retail machine that sells official Pokémon TCG products.</AccordionContent>
      </AccordionItem>
      <AccordionItem value="b">
        <AccordionTrigger>Is PokeFindr available outside the US?</AccordionTrigger>
        <AccordionContent>Not yet. Other countries appear grey on the map until we add them.</AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
}
