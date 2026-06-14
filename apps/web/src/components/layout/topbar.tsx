/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { Search, Moon, Sun, Monitor, Check, LogOut, Menu } from "lucide-react"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import { useRouterState } from "@tanstack/react-router"
import { useSession, useSignOut } from "@/lib/auth"
import { getSearchContextFromPath } from "@/lib/search-context"
import { useAppStore } from "@/stores/app-store"
import { useSearchStore } from "@/stores/search-store"
import { useCommandPaletteStore } from "@/stores/command-palette-store"
import { NotificationBell } from "@/components/features/notification-bell"
import { BrandMark, useBranding } from "@/lib/branding"

interface TopbarProps {
  onOpenSidebar: () => void
}

export function Topbar({ onOpenSidebar }: TopbarProps) {
  const { data: session, isLoading } = useSession()
  const signOut = useSignOut()
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const searchContext = getSearchContextFromPath(pathname)
  const routeKey = searchContext.routeKey
  const query = useSearchStore((state) => (routeKey ? state[routeKey].query : ""))
  const setRouteQuery = useSearchStore((state) => state.setRouteQuery)
  const branding = useBranding()

  const themeOptions = [
    { value: "light" as const, label: "Light", icon: Sun },
    { value: "dark" as const, label: "Dark", icon: Moon },
    { value: "system" as const, label: "System", icon: Monitor },
  ]

  const ActiveIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor

  return (
    <header className="h-topbar border-border-muted bg-bg-primary flex shrink-0 items-center gap-2 border-b px-3 sm:gap-4 sm:px-4">
      <button
        type="button"
        onClick={onOpenSidebar}
        className="text-text-secondary hover:bg-surface-hover hover:text-text-primary rounded-lg p-2 transition-colors lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex min-w-0 items-center gap-2">
        <BrandMark className="h-6 w-6" />
        <span className="text-text-primary hidden truncate text-lg font-semibold tracking-tight sm:block">
          {branding.name}
        </span>
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-center">
        <div className="border-border-default bg-bg-tertiary flex w-full max-w-lg items-center gap-2 rounded-xl border px-3 py-2">
          <Search className="text-text-tertiary h-4 w-4" />
          <input
            type="text"
            value={query}
            onChange={(event) => {
              if (routeKey) {
                setRouteQuery(routeKey, event.target.value)
              }
            }}
            placeholder={searchContext.placeholder}
            disabled={!searchContext.enabled}
            className="text-text-primary placeholder:text-text-tertiary disabled:text-text-tertiary min-w-0 flex-1 bg-transparent text-sm outline-none disabled:cursor-not-allowed"
          />
          <button
            type="button"
            onClick={() => useCommandPaletteStore.getState().open()}
            className="border-border-default bg-surface-default text-text-tertiary hover:bg-surface-hover hover:text-text-secondary hidden rounded-md border px-1.5 py-0.5 text-xs transition-colors sm:block"
            aria-label="Open command palette"
          >
            ⌘K
          </button>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              className="text-text-secondary hover:bg-surface-hover hover:text-text-primary rounded-lg p-2 transition-colors"
              aria-label="Change theme"
            >
              <ActiveIcon className="h-5 w-5" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={4}
              className="border-border-default bg-surface-default z-50 min-w-[160px] rounded-xl border p-1 shadow-lg"
            >
              {themeOptions.map((option) => (
                <DropdownMenu.Item
                  key={option.value}
                  onSelect={() => setTheme(option.value)}
                  className="text-text-primary hover:bg-surface-hover focus:bg-surface-hover flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors outline-none"
                >
                  <span className="flex items-center gap-2">
                    <option.icon className="text-text-secondary h-4 w-4" />
                    {option.label}
                  </span>
                  {theme === option.value && <Check className="text-accent h-4 w-4" />}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <NotificationBell />

        {isLoading ? (
          <div className="bg-surface-hover h-8 w-8 animate-pulse rounded-full" />
        ) : session?.user ? (
          <div className="flex items-center gap-1 sm:gap-2">
            {session.user.image ? (
              <img
                src={session.user.image}
                alt={session.user.name}
                className="h-8 w-8 rounded-full"
              />
            ) : (
              <div className="bg-accent flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium text-white">
                {session.user.name.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-text-primary hidden text-sm font-medium md:block">
              {session.user.name}
            </span>
            <button
              onClick={signOut}
              className="text-text-secondary hover:bg-surface-hover hover:text-text-primary rounded-lg p-1.5 transition-colors"
              aria-label="Sign out"
              data-testid="sign-out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="bg-accent h-8 w-8 rounded-full" />
        )}
      </div>
    </header>
  )
}
