import { Hono } from "hono"
import { authMiddleware } from "../../middleware/auth"
import { requirePermission } from "../../middleware/rbac"
import { getDB } from "../../lib/db"
import { createStorageProvider } from "../../services/storage"
import { TrashService, TrashServiceError } from "../../services/trash.service"
import { BatchOperationResponse, ListTrashRequest, type WorkspaceRole } from "@bucketdrive/shared"

interface TrashEnv {
  STORAGE: R2Bucket
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
  R2_ENDPOINT?: string
  DB: D1Database
}

interface TrashVariables {
  user: { id: string; email: string; name: string; role: WorkspaceRole }
  session: { id: string; userId: string; expiresAt: Date }
}

const trash = new Hono<{ Bindings: TrashEnv; Variables: TrashVariables }>()

trash.use("*", authMiddleware)

trash.get("/", requirePermission("files.read"), async (c) => {
  const query = ListTrashRequest.parse(c.req.query())
  const service = new TrashService(getDB(), createStorageProvider(c.env))

  try {
    const result = await service.listTrash(query)
    return c.json(result)
  } catch (err) {
    if (err instanceof TrashServiceError) {
      return c.json({ code: err.code, message: err.message }, err.status as never)
    }
    throw err
  }
})

trash.post(
  "/restore-all",
  requirePermission("files.restore"),
  requirePermission("folders.restore"),
  async (c) => {
    const user = c.get("user")
    const service = new TrashService(getDB(), createStorageProvider(c.env))

    try {
      const result = await service.restoreAllTrash(user.id)
      return c.json(BatchOperationResponse.parse(result))
    } catch (err) {
      if (err instanceof TrashServiceError) {
        return c.json({ code: err.code, message: err.message }, err.status as never)
      }
      throw err
    }
  },
)

trash.post("/empty", requirePermission("trash.permanent_delete"), async (c) => {
  const user = c.get("user")
  const service = new TrashService(getDB(), createStorageProvider(c.env))

  try {
    const result = await service.emptyTrash(user.id)
    return c.json(BatchOperationResponse.parse(result))
  } catch (err) {
    if (err instanceof TrashServiceError) {
      return c.json({ code: err.code, message: err.message }, err.status as never)
    }
    throw err
  }
})

export const trashHandler = trash
