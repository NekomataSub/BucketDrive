import { and, eq, inArray } from "drizzle-orm"
import { favorite, fileObjectTag, fileTag, type fileObject } from "@bucketdrive/shared/db/schema"
import type { FileObject as SharedFileObject, Tag } from "@bucketdrive/shared"
import type { getDB } from "../../lib/db"

type DB = ReturnType<typeof getDB>
type FileRow = typeof fileObject.$inferSelect
type SearchCategory = "all" | "documents" | "images" | "videos" | "audio" | "archives"

const MIME_CATEGORY_PREFIXES: Record<Exclude<SearchCategory, "all">, string[]> = {
  documents: [
    "application/pdf",
    "text/",
    "application/msword",
    "application/vnd.openxmlformats",
    "application/vnd.ms-",
  ],
  images: ["image/"],
  videos: ["video/"],
  audio: ["audio/"],
  archives: [
    "application/zip",
    "application/x-rar",
    "application/gzip",
    "application/x-tar",
    "application/x-7z-compressed",
  ],
}

export function getMimePrefixesForCategory(type: SearchCategory): string[] {
  return type === "all" ? [] : MIME_CATEGORY_PREFIXES[type]
}

export function filterFilesByFolder<T extends { folderId: string | null }>(
  rows: T[],
  folderId?: string | null,
): T[] {
  if (folderId) {
    return rows.filter((file) => file.folderId === folderId)
  }

  return rows.filter((file) => file.folderId === null)
}

export function buildFtsQuery(raw: string): string {
  const tokens = raw
    .trim()
    .replace(/[^\p{L}\p{N}\s.\-_]/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => `${token.replace(/"/g, '""')}*`)

  return tokens.join(" AND ")
}

export async function hydrateFiles(
  db: DB,
  workspaceId: string,
  userId: string,
  rows: FileRow[],
): Promise<SharedFileObject[]> {
  if (rows.length === 0) {
    return []
  }

  const fileIds = rows.map((row) => row.id)

  const [tagLinks, favorites] = await Promise.all([
    db
      .select({
        fileObjectId: fileObjectTag.fileObjectId,
        tagId: fileObjectTag.tagId,
      })
      .from(fileObjectTag)
      .where(inArray(fileObjectTag.fileObjectId, fileIds))
      .all(),
    db
      .select({
        fileObjectId: favorite.fileObjectId,
      })
      .from(favorite)
      .where(
        and(
          eq(favorite.userId, userId),
          eq(favorite.isActive, true),
          inArray(favorite.fileObjectId, fileIds),
        ),
      )
      .all(),
  ])

  const tagIds = Array.from(new Set(tagLinks.map((link) => link.tagId)))
  const tags =
    tagIds.length > 0
      ? await db
          .select()
          .from(fileTag)
          .where(and(eq(fileTag.workspaceId, workspaceId), inArray(fileTag.id, tagIds)))
          .all()
      : []

  const tagById = new Map<string, Tag>(tags.map((tag) => [tag.id, tag]))
  const tagsByFileId = new Map<string, Tag[]>()

  for (const link of tagLinks) {
    const tag = tagById.get(link.tagId)
    if (!tag) continue

    const current = tagsByFileId.get(link.fileObjectId) ?? []
    current.push(tag)
    tagsByFileId.set(link.fileObjectId, current)
  }

  const favoritedFileIds = new Set(favorites.map((entry) => entry.fileObjectId))

  return rows.map((row) => ({
    ...row,
    tags: tagsByFileId.get(row.id) ?? [],
    isFavorited: favoritedFileIds.has(row.id),
  }))
}
