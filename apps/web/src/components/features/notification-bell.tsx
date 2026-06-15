/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-confusing-void-expression, @typescript-eslint/no-floating-promises */
import { useState, useRef, useEffect } from "react"
import { Bell, Check, CheckCheck } from "lucide-react"
import { useNavigate } from "@tanstack/react-router"
import { useNotifications, useUnreadCount, useMarkRead, useMarkAllRead } from "@/lib/api"

function timeAgo(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (seconds < 60) return "Just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${String(minutes)}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${String(hours)}h ago`
  const days = Math.floor(hours / 24)
  return `${String(days)}d ago`
}

function getNotificationLink(type: string, dataRaw?: string | null): string | null {
  if (!dataRaw) return null
  try {
    const data = JSON.parse(dataRaw) as Record<string, unknown>
    if (type === "share.locked" && typeof data.shareId === "string") {
      return "/dashboard/shares"
    }
    if (type === "member.invited" && typeof data.workspaceId === "string") {
      return "/dashboard"
    }
    if (type === "member.joined" && typeof data.workspaceId === "string") {
      return "/dashboard/members"
    }
    if (type === "ownership.transferred" && typeof data.workspaceId === "string") {
      return "/dashboard"
    }
    return null
  } catch {
    return null
  }
}

interface NotificationItem {
  id: string
  userId: string
  workspaceId: string | null
  type: string
  title: string
  message: string
  data?: string | null
  isRead: boolean
  createdAt: string
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const navigate = useNavigate()

  const { data: unreadData } = useUnreadCount()
  const { data: notificationsData } = useNotifications(1, 20)
  const markRead = useMarkRead()
  const markAllRead = useMarkAllRead()

  const unreadCount = unreadData?.count ?? 0
  const notifications: NotificationItem[] = notificationsData?.data ?? []

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setOpen(false)
      }
    }

    if (open) {
      document.addEventListener("mousedown", handleClickOutside)
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [open])

  function handleNotificationClick(notification: NotificationItem) {
    if (!notification.isRead) {
      markRead.mutate({ id: notification.id })
    }
    const link = getNotificationLink(notification.type, notification.data)
    if (link) {
      navigate({ to: link })
    }
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        className="text-text-secondary hover:bg-surface-hover hover:text-text-primary relative rounded-lg p-2 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="bg-error absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="border-border-default bg-surface-default absolute top-full right-0 z-50 mt-2 w-80 rounded-xl border shadow-lg"
        >
          <div className="border-border-muted flex items-center justify-between border-b px-4 py-3">
            <span className="text-text-primary text-sm font-semibold">Notifications</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  void markAllRead.mutate()
                }}
                className="text-accent hover:text-accent-hover flex items-center gap-1 text-xs"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="text-text-tertiary px-4 py-8 text-center text-sm">
                No notifications yet
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleNotificationClick(n)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      handleNotificationClick(n)
                    }
                  }}
                  className={`hover:bg-surface-hover flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${
                    !n.isRead ? "bg-accent/5" : ""
                  } focus-visible:ring-accent cursor-pointer focus-visible:ring-1 focus-visible:outline-none`}
                >
                  <div
                    className={`bg-accent mt-0.5 flex h-2 w-2 shrink-0 rounded-full ${
                      n.isRead ? "opacity-0" : "opacity-100"
                    }`}
                  />
                  <div className="flex-1">
                    <p className="text-text-primary text-sm font-medium">{n.title}</p>
                    <p className="text-text-secondary line-clamp-2 text-xs">{n.message}</p>
                    <p className="text-text-tertiary mt-1 text-[11px]">{timeAgo(n.createdAt)}</p>
                  </div>
                  {!n.isRead && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        void markRead.mutate({ id: n.id })
                      }}
                      className="text-text-tertiary hover:bg-surface-hover hover:text-text-secondary mt-0.5 shrink-0 rounded p-1"
                      aria-label="Mark as read"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
