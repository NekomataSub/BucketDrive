import { createRootRoute, createRoute, createRouter, Outlet, redirect } from "@tanstack/react-router"
import { Layout } from "@/components/layout/layout"
import { HomePage } from "./home"
import { LoginPage } from "./login"
import { JoinPage } from "./join"
import { DashboardPage } from "./app/dashboard"
import { FilesPage } from "./app/files"
import { MembersPage } from "./app/members"
import { AuditPage } from "./app/audit"
import { SettingsPage } from "./app/settings"
import { ShareManagementPage } from "./app/shares"
import { SharedPage } from "./app/shared"
import { TrashPage } from "./app/trash"
import { ShareAccessPage } from "./share.$shareId"
import { PlatformAdminPage } from "./dashboard.platform"

const rootRoute = createRootRoute({
  component: () => <Outlet />,
})

async function checkAuth(): Promise<{ user: Record<string, unknown> } | null> {
  const res = await fetch("/api/auth/get-session", { credentials: "include" })
  if (!res.ok) return null
  const data: unknown = await res.json()
  return data as { user: Record<string, unknown> } | null
}

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  beforeLoad: async () => {
    const session = await checkAuth()
    if (session?.user) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw redirect({ to: "/dashboard" })
    }
  },
  component: LoginPage,
})

const joinRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/join",
  component: JoinPage,
})

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  beforeLoad: async () => {
    const session = await checkAuth()
    if (!session?.user) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw redirect({ to: "/login" })
    }
  },
  component: () => (
    <Layout>
      <Outlet />
    </Layout>
  ),
})

const homeRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/",
  component: HomePage,
})

const dashboardRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/dashboard",
  component: DashboardPage,
})

const filesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/dashboard/files",
  component: FilesPage,
})

const membersRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/dashboard/members",
  component: MembersPage,
})

const auditRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/dashboard/audit",
  component: AuditPage,
})

const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/dashboard/settings",
  component: SettingsPage,
})

const sharedRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/shared",
  component: SharedPage,
})

const shareManagementRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/dashboard/shares",
  component: ShareManagementPage,
})

const trashRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/dashboard/trash",
  component: TrashPage,
})

const platformRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/dashboard/platform",
  component: PlatformAdminPage,
})

const shareAccessRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/share/$shareId",
  component: ShareAccessPage,
})

const routeTree = rootRoute.addChildren([
  loginRoute,
  joinRoute,
  shareAccessRoute,
  appRoute.addChildren([
    homeRoute,
    dashboardRoute,
    filesRoute,
    membersRoute,
    auditRoute,
    settingsRoute,
    sharedRoute,
    shareManagementRoute,
    trashRoute,
    platformRoute,
  ]),
])

export const router = createRouter({
  routeTree,
  defaultPendingComponent: () => (
    <div className="flex h-screen items-center justify-center bg-bg-primary">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
    </div>
  ),
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
