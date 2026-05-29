import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { eq } from "drizzle-orm"
import { afterEach, describe, expect, it } from "vitest"
import * as schema from "@bucketdrive/shared/db/schema"
import {
  bucket,
  member,
  organization,
  platformSettings,
  user,
  workspace,
  workspaceMember,
  workspaceSettings,
} from "@bucketdrive/shared/db/schema"
import { ensureWorkspaceCreationRecords } from "./workspaces.handler"

type ProvisioningDB = Parameters<typeof ensureWorkspaceCreationRecords>[0]

const setupSql = `
CREATE TABLE user (
  id text PRIMARY KEY NOT NULL,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  email_verified integer DEFAULT false NOT NULL,
  image text,
  is_platform_admin integer DEFAULT false NOT NULL,
  can_create_workspaces integer DEFAULT false NOT NULL,
  created_at text DEFAULT (current_timestamp) NOT NULL,
  updated_at text DEFAULT (current_timestamp) NOT NULL
);

CREATE TABLE workspace (
  id text PRIMARY KEY NOT NULL,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  owner_id text NOT NULL,
  storage_quota_bytes integer DEFAULT 10737418240 NOT NULL,
  is_deleted integer DEFAULT false NOT NULL,
  is_platform_default integer DEFAULT false NOT NULL,
  deleted_at text,
  created_at text DEFAULT (current_timestamp) NOT NULL,
  updated_at text DEFAULT (current_timestamp) NOT NULL
);

CREATE TABLE workspace_settings (
  id text PRIMARY KEY NOT NULL,
  workspace_id text NOT NULL UNIQUE REFERENCES workspace(id) ON DELETE cascade,
  default_share_expiration_days integer DEFAULT 30 NOT NULL,
  enable_public_signup integer DEFAULT false NOT NULL,
  trash_retention_days integer DEFAULT 30 NOT NULL,
  max_file_size_bytes integer DEFAULT 5368709120 NOT NULL,
  upload_chunk_size_bytes integer DEFAULT 5242880 NOT NULL,
  allowed_mime_types text,
  branding_logo_url text,
  branding_name text,
  created_at text DEFAULT (current_timestamp) NOT NULL,
  updated_at text DEFAULT (current_timestamp) NOT NULL
);

CREATE TABLE bucket (
  id text PRIMARY KEY NOT NULL,
  workspace_id text NOT NULL REFERENCES workspace(id) ON DELETE cascade,
  name text NOT NULL,
  provider text DEFAULT 'r2' NOT NULL,
  region text,
  visibility text DEFAULT 'private' NOT NULL,
  created_at text DEFAULT (current_timestamp) NOT NULL
);

CREATE TABLE organization (
  id text PRIMARY KEY NOT NULL,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo text,
  created_at text DEFAULT (current_timestamp) NOT NULL,
  metadata text
);

CREATE TABLE member (
  id text PRIMARY KEY NOT NULL,
  organization_id text NOT NULL REFERENCES organization(id) ON DELETE cascade,
  user_id text NOT NULL REFERENCES user(id) ON DELETE cascade,
  role text NOT NULL,
  created_at text DEFAULT (current_timestamp) NOT NULL
);

CREATE TABLE workspace_member (
  id text PRIMARY KEY NOT NULL,
  workspace_id text NOT NULL REFERENCES workspace(id) ON DELETE cascade,
  user_id text NOT NULL,
  role text DEFAULT 'viewer' NOT NULL,
  created_at text DEFAULT (current_timestamp) NOT NULL
);

CREATE TABLE platform_settings (
  id text PRIMARY KEY NOT NULL,
  default_workspace_id text REFERENCES workspace(id) ON DELETE set null,
  allow_user_workspace_creation integer DEFAULT false NOT NULL,
  enable_public_signup integer DEFAULT true NOT NULL,
  platform_name text DEFAULT 'BucketDrive' NOT NULL,
  created_at text DEFAULT (current_timestamp) NOT NULL,
  updated_at text DEFAULT (current_timestamp) NOT NULL
);
`

function createTestDb() {
  const sqlite = new Database(":memory:")
  sqlite.pragma("foreign_keys = ON")
  sqlite.exec(setupSql)

  return {
    db: drizzle(sqlite, { schema }) as unknown as ProvisioningDB,
    sqlite,
  }
}

describe("ensureWorkspaceCreationRecords", () => {
  let sqlite: Database.Database | undefined

  afterEach(() => {
    sqlite?.close()
    sqlite = undefined
  })

  it("creates the organization and owner memberships required by Better Auth", async () => {
    const setup = createTestDb()
    sqlite = setup.sqlite
    const db = setup.db
    const now = "2026-05-29T02:02:56.764Z"
    const currentWorkspace = {
      id: "workspace-1",
      name: "Nekomata",
      slug: "nekomata",
      ownerId: "CYhKgZegJFyYHQcazG8Xl7yQ44Ae8H9E",
      storageQuotaBytes: 10 * 1024 * 1024 * 1024,
      isDeleted: false,
      isPlatformDefault: false,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    }

    await db
      .insert(user)
      .values({
        id: currentWorkspace.ownerId,
        name: "Owner",
        email: "owner@example.com",
        emailVerified: true,
        image: null,
        isPlatformAdmin: true,
        canCreateWorkspaces: true,
        createdAt: now,
        updatedAt: now,
      })
      .run()
    await db.insert(workspace).values(currentWorkspace).run()

    await ensureWorkspaceCreationRecords(db, currentWorkspace, now)

    const createdOrganization = await db
      .select()
      .from(organization)
      .where(eq(organization.id, currentWorkspace.id))
      .get()
    const createdMember = await db
      .select()
      .from(member)
      .where(eq(member.organizationId, currentWorkspace.id))
      .get()
    const createdLegacyMember = await db
      .select()
      .from(workspaceMember)
      .where(eq(workspaceMember.workspaceId, currentWorkspace.id))
      .get()

    expect(createdOrganization).toMatchObject({
      id: currentWorkspace.id,
      slug: currentWorkspace.slug,
    })
    expect(createdMember).toMatchObject({
      userId: currentWorkspace.ownerId,
      role: "owner",
    })
    expect(createdLegacyMember).toMatchObject({
      userId: currentWorkspace.ownerId,
      role: "owner",
    })
  })

  it("completes a partially created workspace without duplicating setup rows", async () => {
    const setup = createTestDb()
    sqlite = setup.sqlite
    const db = setup.db
    const now = "2026-05-29T02:02:56.764Z"
    const currentWorkspace = {
      id: "workspace-2",
      name: "Nekomata",
      slug: "nekomata-partial",
      ownerId: "CYhKgZegJFyYHQcazG8Xl7yQ44Ae8H9E",
      storageQuotaBytes: 10 * 1024 * 1024 * 1024,
      isDeleted: false,
      isPlatformDefault: false,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    }

    await db
      .insert(user)
      .values({
        id: currentWorkspace.ownerId,
        name: "Owner",
        email: "owner@example.com",
        emailVerified: true,
        image: null,
        isPlatformAdmin: true,
        canCreateWorkspaces: true,
        createdAt: now,
        updatedAt: now,
      })
      .run()
    await db.insert(workspace).values(currentWorkspace).run()
    await db
      .insert(workspaceSettings)
      .values({
        id: "settings-1",
        workspaceId: currentWorkspace.id,
        createdAt: now,
        updatedAt: now,
      })
      .run()
    await db
      .insert(bucket)
      .values({
        id: "bucket-1",
        workspaceId: currentWorkspace.id,
        name: `${currentWorkspace.slug}-files`,
        provider: "r2",
        visibility: "private",
        createdAt: now,
      })
      .run()

    await ensureWorkspaceCreationRecords(db, currentWorkspace, now)
    await ensureWorkspaceCreationRecords(db, currentWorkspace, now)

    expect(await db.select().from(workspaceSettings).all()).toHaveLength(1)
    expect(await db.select().from(bucket).all()).toHaveLength(1)
    expect(await db.select().from(organization).all()).toHaveLength(1)
    expect(await db.select().from(member).all()).toHaveLength(1)
    expect(await db.select().from(workspaceMember).all()).toHaveLength(1)
    expect(await db.select().from(platformSettings).all()).toHaveLength(1)
  })
})
