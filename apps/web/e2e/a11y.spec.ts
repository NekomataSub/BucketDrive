import { AxeBuilder } from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"
import {
  createExternalShare,
  createFileFixture,
  getWorkspace,
  loginAs,
  uniqueName,
  users,
} from "./helpers"

async function expectNoA11yViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
}

test("login page has no automated accessibility violations", async ({ page }) => {
  await page.goto("/login")
  await expectNoA11yViolations(page)
})

test("authenticated app pages have no automated accessibility violations", async ({ page }) => {
  await loginAs(page, users.owner)
  const workspace = await getWorkspace(page.request)
  const deletedName = uniqueName("e2e-a11y-trash")
  await createFileFixture(page.request, workspace.id, uniqueName("e2e-a11y-files"))
  await createFileFixture(page.request, workspace.id, deletedName, { deleted: true })

  const pages = [
    { path: "/dashboard/files", heading: "Files" },
    { path: "/dashboard/settings", heading: "Bucket Settings" },
    { path: "/dashboard/trash", heading: "Trash" },
  ]

  for (const { path, heading } of pages) {
    await page.goto(path)
    await expect(page.locator("#main-content")).toBeVisible()
    await expect(page.getByRole("heading", { name: heading })).toBeVisible()
    await expectNoA11yViolations(page)
  }
})

test("password share page has no automated accessibility violations", async ({ page, browser }) => {
  await loginAs(page, users.owner)
  const workspace = await getWorkspace(page.request)
  const file = await createFileFixture(page.request, workspace.id, uniqueName("e2e-a11y-share"))
  const share = await createExternalShare(page.request, workspace.id, file.id, "test1234")

  const externalContext = await browser.newContext()
  const external = await externalContext.newPage()
  await external.goto(`/share/${share.id}`)
  await expect(external.getByTestId("share-password")).toBeVisible()
  await expectNoA11yViolations(external)
  await externalContext.close()
})
