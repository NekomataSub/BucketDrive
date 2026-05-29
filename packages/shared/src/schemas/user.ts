import { z } from "zod"
import { AuthUserId } from "./common"

export const UserSchema = z.object({
  id: AuthUserId,
  email: z.string().email(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  createdAt: z.string().datetime(),
})

export type User = z.infer<typeof UserSchema>

export const SessionInfoSchema = z.object({
  id: z.string().uuid(),
  userId: AuthUserId,
  expiresAt: z.string().datetime(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: z.string().datetime(),
})

export type SessionInfo = z.infer<typeof SessionInfoSchema>
