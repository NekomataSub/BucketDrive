/* eslint-disable @typescript-eslint/no-unsafe-call */
import type { ReactNode } from "react"
import { useState } from "react"
import { Sidebar } from "./sidebar"
import { Topbar } from "./topbar"
import { CommandPalette } from "@/components/features/command-palette"
import { useCommandPaletteShortcut } from "@/hooks/use-command-palette-shortcut"
import { ToastProvider } from "@/components/shared/toast-provider"
import { ToastContainer } from "@/components/shared/toast-container"

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  useCommandPaletteShortcut()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <ToastProvider>
      <div className="bg-bg-primary flex h-dvh flex-col">
        <a
          href="#main-content"
          className="focus:bg-accent sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
        >
          Skip to content
        </a>
        <Topbar
          onOpenSidebar={() => {
            setSidebarOpen(true)
          }}
        />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar
            mobileOpen={sidebarOpen}
            onClose={() => {
              setSidebarOpen(false)
            }}
          />
          <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 overflow-auto">
            {children}
          </main>
        </div>
        <CommandPalette />
        <ToastContainer />
      </div>
    </ToastProvider>
  )
}
