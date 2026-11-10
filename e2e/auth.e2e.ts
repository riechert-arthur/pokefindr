import { expect, test, type Page } from "@playwright/test"
import { latestEmail, linkIn } from "./mailpit"

/**
 * The account flows, with no outside services: sign up, confirm from the
 * email (caught by Mailpit), log in, post a review, log out, reset the
 * password, and the seeded dev user.
 */

const run = Date.now().toString(36)
const email = `e2e-${run}@example.test`
const username = `e2e_${run}`
const password = "an-e2e-password-1234!"
const newPassword = "a-new-e2e-password-5678!"

/** Waits until the page has loaded and React has taken over its forms (typing earlier can be lost). */
async function ready(page: Page) {
  await page.waitForLoadState("networkidle")
}

async function logIn(page: Page, address: string, pass: string) {
  await ready(page)
  await page.getByLabel("Email", { exact: true }).fill(address)
  await page.getByLabel("Password", { exact: true }).fill(pass)
  await page.getByRole("button", { name: "Login" }).click()
  await expect.poll(async () => (await page.context().cookies()).some((c) => c.name === "app_session")).toBe(true)
}

test.describe.configure({ mode: "serial" })

test("sign up, confirm the email, log in, review, log out", async ({ page }) => {
  await page.goto("/signup")
  await ready(page)
  await page.getByLabel("Name", { exact: true }).fill("Eve Tester")
  await page.getByLabel("Username", { exact: true }).fill(username)
  await page.getByLabel("Email", { exact: true }).fill(email)
  await page.getByLabel("Password", { exact: true }).fill(password)
  await page.getByLabel("Verify Password", { exact: true }).fill(password)
  await page.getByRole("button", { name: "Register" }).click()
  await expect(page).toHaveURL(/\/confirm$/)
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible()

  const confirm = await latestEmail(page.request, email, "Confirm your PokeFindr account")
  await page.goto(linkIn(confirm.text))
  await expect(page).toHaveURL(/\/login\?verified=1/)
  await expect(page.getByRole("status")).toContainText("Your email is confirmed")

  await logIn(page, email, password)
  await page.goto("/home")
  await expect(page).toHaveURL(/\/home/)
  const me = await page.request.get("/api/auth/user")
  expect((await me.json()).user.username).toBe(username)

  // Any place will do. There's no list of every place (#201), so look box by box, 300 square degrees at a time.
  let locationId: string | undefined
  for (let west = -125; west < -66 && !locationId; west += 20) {
    for (let south = 24; south < 50 && !locationId; south += 15) {
      const res = await page.request.get(`/api/locations?bbox=${west},${south},${west + 20},${south + 15}`)
      const { features } = (await res.json()) as { features: { id?: string; properties: { id?: string } }[] }
      locationId = features[0]?.id ?? features[0]?.properties.id
    }
  }
  expect(locationId).toBeTruthy()
  const review = await page.request.post("/api/reviews", { data: { locationId, rating: 5, text: "Stocked today (e2e)" } })
  expect(review.status()).toBe(200)

  expect((await page.request.post("/api/auth/logout")).status()).toBe(200)
  await page.goto("/home")
  await expect(page).toHaveURL(/\/login/)
})

test("forgot password, reset it, log in with the new one", async ({ page }) => {
  await page.goto("/login")
  await ready(page)
  await page.getByRole("link", { name: "Forgot your password?" }).click()
  await expect(page).toHaveURL(/\/forgot-password$/)
  await ready(page)
  await page.getByLabel("Email", { exact: true }).fill(email)
  await page.getByRole("button", { name: "Send reset link" }).click()
  await expect(page.getByRole("status")).toContainText("a reset link is on its way")

  const reset = await latestEmail(page.request, email, "Reset your PokeFindr password")
  await page.goto(linkIn(reset.text))
  await expect(page).toHaveURL(/\/reset-password\?token=/)
  await ready(page)
  await page.getByLabel("New password", { exact: true }).fill(newPassword)
  await page.getByLabel("Repeat it", { exact: true }).fill(newPassword)
  await page.getByRole("button", { name: "Change password" }).click()
  await expect(page).toHaveURL(/\/login$/)

  await logIn(page, email, newPassword)
})

test("the seeded dev user can log in", async ({ page }) => {
  // Sign-in allows 3 tries per 10 seconds from one address.
  await page.waitForTimeout(10_000)
  await page.goto("/login")
  await logIn(page, "dev@pokefindr.local", "pokefindr-dev-password!")
})
