import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { eq } from "drizzle-orm"
import * as schema from "@bucketdrive/shared/db/schema"
import { v4 as uuid } from "uuid"
import { existsSync, readdirSync, statSync } from "fs"
import { resolve, join } from "path"
import { createHash, randomBytes } from "crypto"

const FALLBACK_DB_PATH = resolve(__dirname, "../apps/api/.db/local.sqlite")
const WRANGLER_D1_DIR = resolve(
  __dirname,
  "../.wrangler/state/v3/d1/miniflare-D1DatabaseObject",
)

function resolveDbPath() {
  if (existsSync(WRANGLER_D1_DIR)) {
    const candidates = readdirSync(WRANGLER_D1_DIR)
      .filter((file) => file.endsWith(".sqlite") && file !== "metadata.sqlite")
      .map((file) => join(WRANGLER_D1_DIR, file))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)

    if (candidates.length > 0) {
      return candidates[0]!
    }
  }

  return FALLBACK_DB_PATH
}

function main() {
  console.log("Seeding database...")

  const dbPath = resolveDbPath()
  if (!existsSync(dbPath)) {
    console.error("Database file not found. Run pnpm db:migrate:dev first.")
    process.exit(1)
  }

  console.log(`Using database: ${dbPath}`)
  const sqlite = new Database(dbPath)
  sqlite.pragma("foreign_keys = ON")

  const db = drizzle(sqlite, { schema })

  const wsId = uuid()
  const ownerId = uuid()
  const bucketId = uuid()

  db.insert(schema.workspace).values({
    id: wsId,
    name: "Development Workspace",
    slug: "dev",
    ownerId,
    storageQuotaBytes: 10 * 1024 * 1024 * 1024,
    isPlatformDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }).run()

  db.insert(schema.workspaceSettings).values({
    id: uuid(),
    workspaceId: wsId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }).run()

  const adminId = uuid()
  const editorId = uuid()
  const viewerId = uuid()
  const now = new Date().toISOString()

  db.insert(schema.platformSettings).values({
    id: uuid(),
    defaultWorkspaceId: wsId,
    allowUserWorkspaceCreation: false,
    enablePublicSignup: true,
    platformName: "BucketDrive",
    createdAt: now,
    updatedAt: now,
  }).run()

  const users = [
    { id: ownerId, name: "Owner User", email: "owner@bucketdrive.dev" },
    { id: adminId, name: "Admin User", email: "admin@bucketdrive.dev" },
    { id: editorId, name: "Editor User", email: "editor@bucketdrive.dev" },
    { id: viewerId, name: "Viewer User", email: "viewer@bucketdrive.dev" },
  ]

  for (const seededUser of users) {
    const isOwner = seededUser.id === ownerId
    db.insert(schema.user).values({
      id: seededUser.id,
      name: seededUser.name,
      email: seededUser.email,
      emailVerified: true,
      image: null,
      isPlatformAdmin: isOwner,
      canCreateWorkspaces: isOwner,
      createdAt: now,
      updatedAt: now,
    }).run()
  }

  db.insert(schema.organization).values({
    id: wsId,
    name: "Development Workspace",
    slug: "dev",
    logo: null,
    metadata: JSON.stringify({ workspaceId: wsId }),
    createdAt: now,
  }).run()

  db.insert(schema.workspaceMember).values({
    id: uuid(),
    workspaceId: wsId,
    userId: ownerId,
    role: "owner",
    createdAt: now,
  }).run()

  db.insert(schema.workspaceMember).values({
    id: uuid(),
    workspaceId: wsId,
    userId: adminId,
    role: "admin",
    createdAt: now,
  }).run()

  db.insert(schema.workspaceMember).values({
    id: uuid(),
    workspaceId: wsId,
    userId: editorId,
    role: "editor",
    createdAt: now,
  }).run()

  db.insert(schema.workspaceMember).values({
    id: uuid(),
    workspaceId: wsId,
    userId: viewerId,
    role: "viewer",
    createdAt: now,
  }).run()

  for (const seededMember of [
    { userId: ownerId, role: "owner" },
    { userId: adminId, role: "admin" },
    { userId: editorId, role: "editor" },
    { userId: viewerId, role: "viewer" },
  ]) {
    db.insert(schema.member).values({
      id: uuid(),
      organizationId: wsId,
      userId: seededMember.userId,
      role: seededMember.role,
      createdAt: now,
    }).run()
  }

  db.insert(schema.bucket).values({
    id: bucketId,
    workspaceId: wsId,
    name: "Default",
    provider: "r2",
    createdAt: new Date().toISOString(),
  }).run()

  const rootFolderId = uuid()

  db.insert(schema.folder).values({
    id: rootFolderId,
    workspaceId: wsId,
    parentFolderId: null,
    name: "Documents",
    path: "/Documents",
    createdBy: ownerId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }).run()

  const sampleFiles = [
    { name: "welcome.txt", mime: "text/plain", ext: ".txt", size: 1200 },
    { name: "getting-started.pdf", mime: "application/pdf", ext: ".pdf", size: 560000 },
  ]

  for (const file of sampleFiles) {
    db.insert(schema.fileObject).values({
      id: uuid(),
      workspaceId: wsId,
      bucketId,
      folderId: null,
      ownerId,
      storageKey: `workspace/${wsId}/files/${uuid()}`,
      originalName: file.name,
      mimeType: file.mime,
      extension: file.ext,
      sizeBytes: file.size,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).run()
  }

  const folderFiles = [
    { name: "project-proposal.pdf", mime: "application/pdf", ext: ".pdf", size: 245000 },
    { name: "budget-2025.xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: ".xlsx", size: 89000 },
    { name: "team-photo.png", mime: "image/png", ext: ".png", size: 3200000 },
    { name: "meeting-notes.md", mime: "text/markdown", ext: ".md", size: 4200 },
    { name: "presentation.pptx", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", ext: ".pptx", size: 5600000 },
  ]

  for (const file of folderFiles) {
    db.insert(schema.fileObject).values({
      id: uuid(),
      workspaceId: wsId,
      bucketId,
      folderId: rootFolderId,
      ownerId,
      storageKey: `workspace/${wsId}/files/${uuid()}`,
      originalName: file.name,
      mimeType: file.mime,
      extension: file.ext,
      sizeBytes: file.size,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).run()
  }

  const tagColors = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6"]
  const tagNames = ["Important", "Draft", "Final", "Archived", "Review"]

  for (let i = 0; i < tagNames.length; i++) {
    db.insert(schema.fileTag).values({
      id: uuid(),
      workspaceId: wsId,
      name: tagNames[i]!,
      color: tagColors[i]!,
      createdAt: new Date().toISOString(),
    }).run()
  }

  const seedFileIds = db
    .select({ id: schema.fileObject.id, name: schema.fileObject.originalName })
    .from(schema.fileObject)
    .where(eq(schema.fileObject.workspaceId, wsId))
    .all()

  if (seedFileIds.length > 0) {
    const firstFile = seedFileIds[0]!
    const shareId = uuid()

    db.insert(schema.shareLink).values({
      id: shareId,
      workspaceId: wsId,
      resourceType: "file",
      resourceId: firstFile.id,
      shareType: "internal",
      createdBy: ownerId,
      isActive: true,
      accessCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).run()

    db.insert(schema.sharePermission).values({
      id: uuid(),
      shareLinkId: shareId,
      permission: "read",
    }).run()

    db.insert(schema.sharePermission).values({
      id: uuid(),
      shareLinkId: shareId,
      permission: "download",
    }).run()

    console.log(`  Seed share ID: ${shareId} (shared ${firstFile.name})`)

    const externalPassword = "test123"
    const extSalt = randomBytes(16).toString("hex")
    const extHash = createHash("sha256").update(externalPassword + extSalt).digest("hex")
    const extPasswordHash = `${extSalt}:${extHash}`

    const extShareId = uuid()
    db.insert(schema.shareLink).values({
      id: extShareId,
      workspaceId: wsId,
      resourceType: "file",
      resourceId: firstFile.id,
      shareType: "external_direct",
      createdBy: ownerId,
      passwordHash: extPasswordHash,
      isActive: true,
      accessCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).run()

    console.log(`  External share ID: ${extShareId} (password: ${externalPassword})`)
  }

  const inviteToken = uuid()
  const inviteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  db.insert(schema.workspaceInvitation).values({
    id: uuid(),
    workspaceId: wsId,
    email: "pending@bucketdrive.dev",
    token: inviteToken,
    role: "editor",
    canCreateWorkspaces: false,
    invitedBy: ownerId,
    status: "pending",
    expiresAt: inviteExpiresAt,
    createdAt: now,
    updatedAt: now,
  }).run()

  console.log(`Seeded workspace: ${wsId}`)
  console.log(`  Owner ID: ${ownerId}`)
  console.log(`  Admin ID: ${adminId}`)
  console.log(`  Editor ID: ${editorId}`)
  console.log(`  Viewer ID: ${viewerId}`)
  console.log(`  Files: ${sampleFiles.length + folderFiles.length}`)
  console.log(`  Tags: ${tagNames.length}`)
  console.log(`  Pending invitation: ${inviteToken} (pending@bucketdrive.dev)`)

  sqlite.close()
}

main()
