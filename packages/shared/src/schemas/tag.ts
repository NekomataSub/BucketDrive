import { z } from "zod"

export const TagSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  color: z.string(),
  createdAt: z.iso.datetime(),
})

export type Tag = z.infer<typeof TagSchema>
