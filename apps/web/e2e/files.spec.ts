import { expect, test } from "@playwright/test"
import {
  createExternalShare,
  createFileFixture,
  getWorkspace,
  loginAs,
  uniqueName,
  users,
} from "./helpers"

test("created upload fixture appears in the explorer", async ({ page }) => {
  await loginAs(page, users.owner)
  const workspace = await getWorkspace(page.request)
  const fileName = uniqueName("e2e-upload")

  await createFileFixture(page.request, workspace.id, fileName)
  await page.goto("/dashboard/files")

  await expect(page.getByText(fileName)).toBeVisible()
})

test("password protected public share can be opened and exposes download action", async ({
  page,
  browser,
}) => {
  await loginAs(page, users.owner)
  const workspace = await getWorkspace(page.request)
  const file = await createFileFixture(page.request, workspace.id, uniqueName("e2e-share"))
  const share = await createExternalShare(page.request, workspace.id, file.id, "test1234")

  const externalContext = await browser.newContext()
  const external = await externalContext.newPage()
  await external.goto(`/share/${share.id}`)
  await external.getByTestId("share-password").fill("test1234")
  await external.getByTestId("share-access").click()

  await expect(external.getByTestId("download-file")).toBeVisible()
  await externalContext.close()
})

test("viewer can browse files but cannot access delete actions", async ({ page }) => {
  await loginAs(page, users.viewer)
  const workspace = await getWorkspace(page.request)
  expect(workspace.role).toBe("viewer")
  const fileName = uniqueName("e2e-viewer")
  await createFileFixture(page.request, workspace.id, fileName)

  await page.goto("/dashboard/files")
  await expect(page.getByTestId("files-page")).toHaveAttribute("data-workspace-role", "viewer")
  const card = page.getByText(fileName).locator("xpath=ancestor::*[@data-testid='file-card']")
  await expect(card).toBeVisible()
  await expect(page.getByText("Delete selected")).toHaveCount(0)

  await card.click({ button: "right" })
  const visibleMenu = page.locator('[role="menu"]:visible')
  await expect(visibleMenu).toBeVisible()
  await expect(visibleMenu.getByRole("menuitem", { name: /Delete/ })).toHaveCount(0)
})

test("search filters files and clear returns to browse results", async ({ page }) => {
  await loginAs(page, users.owner)
  const workspace = await getWorkspace(page.request)
  const fileName = uniqueName("e2e-search")
  await createFileFixture(page.request, workspace.id, fileName)

  await page.goto("/dashboard/files")
  await page.getByPlaceholder("Search files, tags, and favorites").fill(fileName)
  await expect(page.getByTestId("file-card").getByText(fileName)).toBeVisible()

  await page.getByRole("button", { name: "Clear search" }).click()
  await expect(page.getByTestId("file-card").getByText(fileName)).toBeVisible()
})

test("new folder uses the custom text input dialog", async ({ page }) => {
  await loginAs(page, users.owner)
  const folderName = uniqueName("e2e-folder", "folder")

  await page.goto("/dashboard/files")
  await page.getByRole("button", { name: "New Folder" }).click()
  const dialog = page.getByRole("dialog", { name: "New folder" })
  await expect(dialog).toBeVisible()

  await dialog.getByLabel("Folder name").fill(folderName)
  await dialog.getByRole("button", { name: "Create folder" }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator("button").filter({ hasText: folderName })).toBeVisible()
})

test("move action opens a folder picker instead of asking for an ID", async ({ page }) => {
  await loginAs(page, users.owner)
  const workspace = await getWorkspace(page.request)
  const fileName = uniqueName("e2e-move-picker")
  await createFileFixture(page.request, workspace.id, fileName)

  await page.goto("/dashboard/files")
  const card = page.getByText(fileName).locator("xpath=ancestor::*[@data-testid='file-card']")
  await expect(card).toBeVisible()
  await card.click({ button: "right" })
  await page.locator('[role="menu"]:visible').getByRole("menuitem", { name: "Move" }).click()

  const dialog = page.getByRole("dialog", { name: "Move items" })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText("Destination: Root")).toBeVisible()
  await expect(dialog.getByPlaceholder("New folder in Root")).toBeVisible()
  await expect(dialog.getByRole("button", { name: "Move here" })).toBeVisible()
})

test("context menu actions open dialogs for a file", async ({ page }) => {
  await loginAs(page, users.owner)
  const workspace = await getWorkspace(page.request)
  const fileName = uniqueName("e2e-context-menu")
  await createFileFixture(page.request, workspace.id, fileName)

  await page.goto("/dashboard/files")
  const card = page.getByText(fileName).locator("xpath=ancestor::*[@data-testid='file-card']")
  await expect(card).toBeVisible()

  await card.click({ button: "right" })
  await page.locator('[role="menu"]:visible').getByRole("menuitem", { name: "Rename" }).click()
  await expect(page.getByRole("dialog", { name: "Rename item" })).toBeVisible()
  await page.keyboard.press("Escape")

  await card.click({ button: "right" })
  await page.locator('[role="menu"]:visible').getByRole("menuitem", { name: "Share" }).click()
  await expect(page.getByRole("dialog", { name: new RegExp(`Share.*${fileName}`) })).toBeVisible()
})

test("batch toolbar exposes shared actions for selected files", async ({ page }) => {
  await loginAs(page, users.owner)
  const workspace = await getWorkspace(page.request)
  const firstName = uniqueName("e2e-batch-one")
  const secondName = uniqueName("e2e-batch-two")
  await createFileFixture(page.request, workspace.id, firstName)
  await createFileFixture(page.request, workspace.id, secondName)

  await page.goto("/dashboard/files")
  const firstCard = page.getByText(firstName).locator("xpath=ancestor::*[@data-testid='file-card']")
  const secondCard = page
    .getByText(secondName)
    .locator("xpath=ancestor::*[@data-testid='file-card']")
  await expect(firstCard).toBeVisible()
  await expect(secondCard).toBeVisible()

  await page.keyboard.down("Control")
  await firstCard.click()
  await secondCard.click()
  await page.keyboard.up("Control")

  await expect(page.getByText("2 items selected")).toBeVisible()
  await expect(page.getByRole("button", { name: "Share selected" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Tags" })).toBeVisible()
  await page.getByRole("button", { name: "Move selected" }).click()
  await expect(page.getByRole("dialog", { name: "Move items" })).toBeVisible()
})

test("deleted file appears in trash and can be restored", async ({ page }) => {
  await loginAs(page, users.owner)
  const workspace = await getWorkspace(page.request)
  const fileName = uniqueName("e2e-trash")
  const file = await createFileFixture(page.request, workspace.id, fileName)

  const deleted = await page.request.delete(`/api/workspaces/${workspace.id}/files/${file.id}`)
  expect(deleted.ok()).toBeTruthy()

  await page.goto("/dashboard/trash")
  const row = page.getByRole("row", { name: new RegExp(fileName) })
  await expect(row).toBeVisible()
  await row.getByRole("button", { name: "Restore" }).click()

  await page.goto("/dashboard/files")
  await expect(page.getByText(fileName)).toBeVisible()
})

test("permanent trash delete uses the custom confirmation dialog", async ({ page }) => {
  await loginAs(page, users.owner)
  const workspace = await getWorkspace(page.request)
  const fileName = uniqueName("e2e-trash-permanent")
  await createFileFixture(page.request, workspace.id, fileName, { deleted: true })

  await page.goto("/dashboard/trash")
  const row = page.getByRole("row", { name: new RegExp(fileName) })
  await expect(row).toBeVisible()

  await row.getByRole("button", { name: "Delete permanently" }).click()
  const dialog = page.getByRole("dialog", { name: "Delete permanently?" })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText("This cannot be undone.")

  await dialog.getByRole("button", { name: "Cancel" }).click()
  await expect(dialog).toBeHidden()
  await expect(row).toBeVisible()

  await row.getByRole("button", { name: "Delete permanently" }).click()
  await page
    .getByRole("dialog", { name: "Delete permanently?" })
    .getByRole("button", { name: "Delete permanently" })
    .click()
  await expect(row).toBeHidden()
})
