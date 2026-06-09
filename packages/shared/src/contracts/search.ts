import { z } from "zod"
import { PaginatedResponseSchema } from "../schemas/common"
import { FileObjectSchema } from "../schemas/file"

export const SearchRequest = z.object({
  q: z.string().trim().max(200).optional(),
  type: z.enum(["all", "documents", "images", "videos", "audio", "archives"]).default("all"),
  tags: z.array(z.uuid()).optional(),
  favorite: z.coerce.boolean().optional(),
  sort: z.enum(["relevance", "name", "created_at", "size", "type"]).default("relevance"),
  order: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
})

export const SearchResponse = PaginatedResponseSchema(FileObjectSchema)
