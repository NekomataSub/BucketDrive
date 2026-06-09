import { z } from "zod"
import { TagSchema } from "../schemas/tag"

export const ListTagsResponse = z.object({
  data: z.array(TagSchema),
})

export const CreateTagRequest = z.object({
  name: z.string().trim().min(1).max(64),
  color: z.string().trim().min(4).max(32),
})

export const UpdateTagRequest = z
  .object({
    name: z.string().trim().min(1).max(64).optional(),
    color: z.string().trim().min(4).max(32).optional(),
  })
  .refine((value) => value.name !== undefined || value.color !== undefined, {
    message: "At least one field must be provided",
  })

export const DeleteTagResponse = z.object({
  success: z.literal(true),
  tagId: z.uuid(),
})
