import { describe, it, expect } from "vitest"
import { can, canWithInheritance } from "../can"
import type { WorkspaceRole } from "../../schemas/common"
import type { Permission } from "../permissions"
import { ALL_PERMISSIONS, ROLE_PERMISSIONS } from "../permissions"

describe("can() — RBAC permission evaluation", () => {
  const roles: WorkspaceRole[] = ["owner", "admin", "manager", "editor", "viewer", "guest"]

  describe("owner", () => {
    it("has all permissions", () => {
      for (const permission of ALL_PERMISSIONS) {
        expect(can("owner", permission)).toBe(true)
      }
    })
  })

  describe("admin", () => {
    const adminAllowed = ROLE_PERMISSIONS.admin

    it("has all permissions except workspace.delete and workspace.transfer", () => {
      for (const permission of ALL_PERMISSIONS) {
        if (permission === "workspace.delete" || permission === "workspace.transfer") {
          expect(can("admin", permission)).toBe(false)
        } else {
          expect(can("admin", permission)).toBe(true)
        }
      }
    })

    it("has at least these permissions", () => {
      for (const permission of adminAllowed) {
        expect(can("admin", permission)).toBe(true)
      }
    })
  })

  describe("manager", () => {
    const managerAllowed = ROLE_PERMISSIONS.manager
    const managerDenied: Permission[] = [
      "billing.read",
      "billing.manage",
      "users.invite",
      "users.remove",
      "users.update_roles",
      "workspace.settings.update",
      "workspace.delete",
      "workspace.transfer",
      "trash.permanent_delete",
    ]

    it("can read, upload, rename, move, favorite, tag, share files", () => {
      expect(can("manager", "files.read")).toBe(true)
      expect(can("manager", "files.upload")).toBe(true)
      expect(can("manager", "files.rename")).toBe(true)
      expect(can("manager", "files.move")).toBe(true)
      expect(can("manager", "files.copy")).toBe(true)
      expect(can("manager", "files.favorite")).toBe(true)
      expect(can("manager", "files.tag")).toBe(true)
      expect(can("manager", "files.share")).toBe(true)
    })

    it("can create, rename, move, share folders", () => {
      expect(can("manager", "folders.read")).toBe(true)
      expect(can("manager", "folders.create")).toBe(true)
      expect(can("manager", "folders.rename")).toBe(true)
      expect(can("manager", "folders.move")).toBe(true)
      expect(can("manager", "folders.share")).toBe(true)
    })

    it("can delete and restore files and folders", () => {
      expect(can("manager", "files.delete")).toBe(true)
      expect(can("manager", "files.restore")).toBe(true)
      expect(can("manager", "folders.delete")).toBe(true)
      expect(can("manager", "folders.restore")).toBe(true)
    })

    it("can manage shares", () => {
      expect(can("manager", "shares.read")).toBe(true)
      expect(can("manager", "shares.create")).toBe(true)
      expect(can("manager", "shares.update")).toBe(true)
      expect(can("manager", "shares.revoke")).toBe(true)
      expect(can("manager", "shares.manage_all")).toBe(true)
    })

    it("can read analytics, audit, users, and workspace settings", () => {
      expect(can("manager", "analytics.read")).toBe(true)
      expect(can("manager", "audit.read")).toBe(true)
      expect(can("manager", "audit.export")).toBe(true)
      expect(can("manager", "users.read")).toBe(true)
      expect(can("manager", "workspace.settings.read")).toBe(true)
    })

    it("cannot manage billing, invite/remove users, or update workspace settings", () => {
      for (const permission of managerDenied) {
        expect(can("manager", permission)).toBe(false)
      }
    })

    it("matches the defined manager permission set", () => {
      for (const permission of managerAllowed) {
        expect(can("manager", permission)).toBe(true)
      }
    })
  })

  describe("editor", () => {
    const editorAllowed = ROLE_PERMISSIONS.editor
    const editorDenied: Permission[] = [
      "files.delete",
      "files.restore",
      "folders.delete",
      "trash.permanent_delete",
      "shares.manage_all",
      "users.invite",
      "users.remove",
      "users.update_roles",
      "users.read",
      "billing.read",
      "billing.manage",
      "analytics.read",
      "audit.read",
      "audit.export",
      "workspace.settings.read",
      "workspace.settings.update",
      "workspace.delete",
      "workspace.transfer",
    ]

    it("can read, upload, rename, move, favorite, tag, share files", () => {
      expect(can("editor", "files.read")).toBe(true)
      expect(can("editor", "files.upload")).toBe(true)
      expect(can("editor", "files.rename")).toBe(true)
      expect(can("editor", "files.move")).toBe(true)
      expect(can("editor", "files.copy")).toBe(true)
      expect(can("editor", "files.favorite")).toBe(true)
      expect(can("editor", "files.tag")).toBe(true)
      expect(can("editor", "files.share")).toBe(true)
    })

    it("can create, rename, move, share folders", () => {
      expect(can("editor", "folders.read")).toBe(true)
      expect(can("editor", "folders.create")).toBe(true)
      expect(can("editor", "folders.rename")).toBe(true)
      expect(can("editor", "folders.move")).toBe(true)
      expect(can("editor", "folders.share")).toBe(true)
    })

    it("can manage shares", () => {
      expect(can("editor", "shares.read")).toBe(true)
      expect(can("editor", "shares.create")).toBe(true)
      expect(can("editor", "shares.update")).toBe(true)
      expect(can("editor", "shares.revoke")).toBe(true)
    })

    it("cannot delete files/folders, manage users, billing, audit, or workspace", () => {
      for (const permission of editorDenied) {
        expect(can("editor", permission)).toBe(false)
      }
    })

    it("matches the defined editor permission set", () => {
      for (const permission of editorAllowed) {
        expect(can("editor", permission)).toBe(true)
      }
    })
  })

  describe("viewer", () => {
    it("can only read", () => {
      expect(can("viewer", "files.read")).toBe(true)
      expect(can("viewer", "folders.read")).toBe(true)
      expect(can("viewer", "shares.read")).toBe(true)
    })

    it("cannot write or modify anything", () => {
      const writePermissions: Permission[] = [
        "files.upload",
        "files.rename",
        "files.move",
        "files.copy",
        "files.delete",
        "files.restore",
        "files.favorite",
        "files.tag",
        "files.share",
        "folders.create",
        "folders.rename",
        "folders.move",
        "folders.delete",
        "folders.share",
        "shares.create",
        "shares.update",
        "shares.revoke",
        "shares.manage_all",
        "trash.permanent_delete",
      ]

      for (const permission of writePermissions) {
        expect(can("viewer", permission)).toBe(false)
      }
    })

    it("cannot access admin features", () => {
      expect(can("viewer", "users.invite")).toBe(false)
      expect(can("viewer", "users.read")).toBe(false)
      expect(can("viewer", "billing.read")).toBe(false)
      expect(can("viewer", "analytics.read")).toBe(false)
      expect(can("viewer", "audit.read")).toBe(false)
      expect(can("viewer", "workspace.settings.read")).toBe(false)
      expect(can("viewer", "workspace.delete")).toBe(false)
      expect(can("viewer", "workspace.transfer")).toBe(false)
    })
  })

  describe("guest", () => {
    it("can only read files and folders", () => {
      expect(can("guest", "files.read")).toBe(true)
      expect(can("guest", "folders.read")).toBe(true)
    })

    it("cannot access shares, write, or admin features", () => {
      const deniedPermissions: Permission[] = [
        "shares.read",
        "shares.manage_all",
        "trash.permanent_delete",
        "files.upload",
        "files.rename",
        "files.move",
        "files.copy",
        "files.delete",
        "files.restore",
        "files.favorite",
        "files.tag",
        "files.share",
        "folders.create",
        "folders.rename",
        "folders.move",
        "folders.delete",
        "folders.share",
        "users.invite",
        "users.remove",
        "users.update_roles",
        "users.read",
        "billing.read",
        "billing.manage",
        "analytics.read",
        "audit.read",
        "audit.export",
        "workspace.settings.read",
        "workspace.settings.update",
        "workspace.delete",
        "workspace.transfer",
      ]

      for (const permission of deniedPermissions) {
        expect(can("guest", permission)).toBe(false)
      }
    })
  })

  describe("ownership override", () => {
    const userId = "user-123"
    const otherId = "user-456"

    it("owner of a file can delete it even if role doesn't allow (editor+delete)", () => {
      expect(can("editor", "files.delete", userId, userId)).toBe(true)
    })

    it("owner of a file can restore it even if role doesn't allow (editor+restore)", () => {
      expect(can("editor", "files.restore", userId, userId)).toBe(true)
    })

    it("owner of a folder can delete it even if role doesn't allow (editor+folder.delete)", () => {
      expect(can("editor", "folders.delete", userId, userId)).toBe(true)
    })

    it("manager can use ownership override", () => {
      expect(can("manager", "files.delete", userId, userId)).toBe(true)
      expect(can("manager", "folders.delete", userId, userId)).toBe(true)
    })

    it("guest cannot use ownership override", () => {
      expect(can("guest", "files.delete", userId, userId)).toBe(false)
      expect(can("guest", "folders.delete", userId, userId)).toBe(false)
    })

    it("non-owner cannot use ownership override", () => {
      expect(can("editor", "files.delete", userId, otherId)).toBe(false)
    })

    it("viewer cannot use ownership override", () => {
      expect(can("viewer", "files.delete", userId, userId)).toBe(false)
    })

    it("ownership override does not grant unrelated permissions", () => {
      expect(can("editor", "users.invite", userId, userId)).toBe(false)
      expect(can("editor", "billing.read", userId, userId)).toBe(false)
      expect(can("editor", "analytics.read", userId, userId)).toBe(false)
    })

    it("owner role still has full access (ownership override is irrelevant)", () => {
      for (const permission of ALL_PERMISSIONS) {
        expect(can("owner", permission)).toBe(true)
        expect(can("owner", permission, userId, userId)).toBe(true)
      }
    })
  })

  describe("permission inheritance", () => {
    it("grants folders.read on children when parent access exists and role has folders.read", () => {
      expect(canWithInheritance("viewer", "folders.read", { hasParentReadAccess: true })).toBe(true)
      expect(canWithInheritance("editor", "folders.read", { hasParentReadAccess: true })).toBe(true)
    })

    it("falls back to base can() when parent access is absent or context missing", () => {
      expect(canWithInheritance("viewer", "folders.read", { hasParentReadAccess: false })).toBe(true)
      expect(canWithInheritance("viewer", "folders.read")).toBe(true)
      expect(canWithInheritance("viewer", "files.upload")).toBe(false)
    })

    it("does not inherit non-read permissions via parent access", () => {
      expect(canWithInheritance("viewer", "folders.create", { hasParentReadAccess: true })).toBe(false)
      expect(canWithInheritance("editor", "folders.delete", { hasParentReadAccess: true })).toBe(false)
    })
  })

  describe("every role", () => {
    it("has a defined permission set", () => {
      for (const role of roles) {
        expect(ROLE_PERMISSIONS[role]).toBeDefined()
        expect(ROLE_PERMISSIONS[role].length).toBeGreaterThan(0)
      }
    })
  })
})
