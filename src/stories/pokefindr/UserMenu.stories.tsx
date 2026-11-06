import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import axios from "axios"
import { UserMenu } from "@/components/pokefindr/UserMenu"
import { Toaster } from "@/components/ui/sonner"

const meta = {
  title: "PokeFindr/UserMenu",
  component: UserMenu,
  args: { size: 40, userName: "misty" },
  // UserMenu uses next/navigation's router, which needs the App Router mock.
  parameters: { nextjs: { appDirectory: true } },
  // Answer the logout POST locally, so Log out shows the success path instead
  // of a 404 from the Storybook server.
  beforeEach: () => {
    const adapter = axios.defaults.adapter
    axios.defaults.adapter = async (config) => ({ data: {}, status: 200, statusText: "OK", headers: {}, config })
    return () => {
      axios.defaults.adapter = adapter
    }
  },
} satisfies Meta<typeof UserMenu>
export default meta
export const Default: StoryObj<typeof meta> = {}
/** Inline Settings and Log out, for the mobile nav drawer. */
export const List: StoryObj<typeof meta> = { args: { variant: "list" } }
/** Log out fails: the menu stays and a toast explains. */
export const LogoutFails: StoryObj<typeof meta> = {
  args: { variant: "list" },
  beforeEach: () => {
    const adapter = axios.defaults.adapter
    axios.defaults.adapter = async () => Promise.reject(new Error("Network Error"))
    return () => {
      axios.defaults.adapter = adapter
    }
  },
  decorators: [
    (Story) => (
      <>
        <Story />
        <Toaster />
      </>
    ),
  ],
}
