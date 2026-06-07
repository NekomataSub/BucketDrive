import { describe, expect, it } from "vitest"
import { BatchOperationResponse, ListTrashResponse, RestoreFileResponse } from "@bucketdrive/shared"
import { createContractTestContext, expectApiError } from "./test-harness"

describe("trash contracts", () => {
  it("lists trashed resources and restores files", async () => {
    const ctx = createContractTestContext()
    const trashed = ctx.seedFile({
      originalName: "Deleted.txt",
      isDeleted: true,
      deletedAt: "2026-06-02T12:00:00.000Z",
    })

    const list = await ctx.request(`/api/workspaces/${ctx.workspaceId}/trash`)
    expect(list.status).toBe(200)
    ListTrashResponse.parse(await ctx.json(list))

    const restore = await ctx.request(
      `/api/workspaces/${ctx.workspaceId}/files/${trashed.id}/restore`,
      {
        method: "POST",
      },
    )
    expect(restore.status).toBe(200)
    RestoreFileResponse.parse(await ctx.json(restore))
  })

  it("allows global readers and returns validation errors", async () => {
    const ctx = createContractTestContext()
    const allowed = await ctx.request(`/api/workspaces/${ctx.workspaceId}/trash`, {
      userId: ctx.outsider.id,
    })
    expect(allowed.status).toBe(200)
    ListTrashResponse.parse(await ctx.json(allowed))

    const invalid = await ctx.request(`/api/workspaces/${ctx.workspaceId}/trash?limit=500`)
    expect(invalid.status).toBe(400)
    expectApiError(await ctx.json(invalid))
  })

  it("restores all trashed resources", async () => {
    const ctx = createContractTestContext()
    const parent = ctx.seedFolder({
      name: "Deleted folder",
      path: "/Deleted folder",
      isDeleted: true,
      deletedAt: "2026-06-02T12:00:00.000Z",
    })
    const child = ctx.seedFolder({
      parentFolderId: parent.id,
      name: "Child folder",
      path: "/Deleted folder/Child folder",
      isDeleted: true,
      deletedAt: "2026-06-02T12:00:00.000Z",
    })
    const nestedFile = ctx.seedFile({
      folderId: child.id,
      originalName: "Nested deleted.txt",
      isDeleted: true,
      deletedAt: "2026-06-02T12:00:00.000Z",
    })
    const rootFile = ctx.seedFile({
      originalName: "Root deleted.txt",
      isDeleted: true,
      deletedAt: "2026-06-02T12:00:00.000Z",
    })

    const restore = await ctx.request(`/api/workspaces/${ctx.workspaceId}/trash/restore-all`, {
      method: "POST",
    })
    expect(restore.status).toBe(200)
    const restoreBody = BatchOperationResponse.parse(await ctx.json(restore))
    expect(restoreBody.failed).toHaveLength(0)
    expect(restoreBody.processed).toEqual(
      expect.arrayContaining([
        { resourceType: "folder", id: parent.id },
        { resourceType: "file", id: rootFile.id },
      ]),
    )

    const remainingTrash = await ctx.request(`/api/workspaces/${ctx.workspaceId}/trash`)
    const remainingTrashBody = ListTrashResponse.parse(await ctx.json(remainingTrash))
    expect(remainingTrashBody.meta.total).toBe(0)
    const restoredNestedFile = ctx.sqlite
      .prepare("select is_deleted from file_object where id = ?")
      .get(nestedFile.id) as { is_deleted: number }
    expect(restoredNestedFile.is_deleted).toBe(0)
  })

  it("empties all trash and enforces permanent delete permission", async () => {
    const ctx = createContractTestContext()
    const folder = ctx.seedFolder({
      name: "Purge folder",
      path: "/Purge folder",
      isDeleted: true,
      deletedAt: "2026-06-02T12:00:00.000Z",
    })
    const nestedFile = ctx.seedFile({
      folderId: folder.id,
      originalName: "Nested purge.txt",
      isDeleted: true,
      deletedAt: "2026-06-02T12:00:00.000Z",
    })
    const rootFile = ctx.seedFile({
      originalName: "Root purge.txt",
      isDeleted: true,
      deletedAt: "2026-06-02T12:00:00.000Z",
    })

    const denied = await ctx.request(`/api/workspaces/${ctx.workspaceId}/trash/empty`, {
      method: "POST",
      userId: ctx.viewer.id,
    })
    expect(denied.status).toBe(403)
    expectApiError(await ctx.json(denied))

    const emptied = await ctx.request(`/api/workspaces/${ctx.workspaceId}/trash/empty`, {
      method: "POST",
    })
    expect(emptied.status).toBe(200)
    const emptiedBody = BatchOperationResponse.parse(await ctx.json(emptied))
    expect(emptiedBody.failed).toHaveLength(0)
    expect(emptiedBody.processed).toEqual(
      expect.arrayContaining([
        { resourceType: "folder", id: folder.id },
        { resourceType: "file", id: rootFile.id },
      ]),
    )
    const remainingFiles = ctx.sqlite
      .prepare("select count(*) as count from file_object where id in (?, ?)")
      .get(rootFile.id, nestedFile.id) as { count: number }
    const remainingFolders = ctx.sqlite
      .prepare("select count(*) as count from folder where id = ?")
      .get(folder.id) as { count: number }
    expect(remainingFiles.count).toBe(0)
    expect(remainingFolders.count).toBe(0)
  })
})
