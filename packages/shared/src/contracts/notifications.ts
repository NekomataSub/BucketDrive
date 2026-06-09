import { z } from "zod"

export const NotificationTypeSchema = z.enum([
  "share.locked",
  "member.invited",
  "member.joined",
  "ownership.transferred",
  "trash.purged",
  "quota.warning",
])

export const NotificationSchema = z.object({
  id: z.uuid(),
  userId: z.string(),
  type: NotificationTypeSchema,
  title: z.string(),
  message: z.string(),
  data: z.string().nullable().optional(),
  isRead: z.boolean(),
  createdAt: z.string(),
})

export const ListNotificationsRequest = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export const ListNotificationsResponse = z.object({
  data: z.array(NotificationSchema),
  meta: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
})

export const UnreadCountResponse = z.object({
  count: z.number(),
})

export const MarkReadResponse = z.object({
  success: z.boolean(),
  id: z.uuid(),
})

export const MarkAllReadResponse = z.object({
  success: z.boolean(),
  count: z.number(),
})

export type NotificationType = z.infer<typeof NotificationTypeSchema>
