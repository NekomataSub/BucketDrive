import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from "@tanstack/react-router"
import { lazy, Suspense, type ComponentType } from "react"
import { Layout } from "@/components/layout/layout"
import { HomePage } from "./home"
import { LoginPage } from "./login"
import { JoinPage } from "./join"
import { SignupDeniedPage } from "./signup-denied"

const DashboardPage = lazy(() =>
  import("./app/dashboard").then((module) => ({ default: module.DashboardPage })),
)
const FilesPage = lazy(() =>
  import("./app/files").then((module) => ({ default: module.FilesPage })),
)
const MembersPage = lazy(() =>
  import("./app/members").then((module) => ({ default: module.MembersPage })),
)
const AuditPage = lazy(() =>
  import("./app/audit").then((module) => ({ default: module.AuditPage })),
)
const SettingsPage = lazy(() =>
  import("./app/settings").then((module) => ({ default: module.SettingsPage })),
)
const ShareManagementPage = lazy(() =>
  import("./app/shares").then((module) => ({ default: module.ShareManagementPage })),
)
const TrashPage = lazy(() =>
  import("./app/trash").then((module) => ({ default: module.TrashPage })),
)
const ShareAccessPage = lazy(() =>
  import("./share.$shareId").then((module) => ({ default: module.ShareAccessPage })),
)
const PlatformAdminPage = lazy(() =>
  import("./dashboard.platform").then((module) => ({ default: module.PlatformAdminPage })),
)

function PendingSpinner() {
  return (
    <div className="bg-bg-primary flex h-screen items-center justify-center">
      <div className="border-accent h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
    </div>
  )
}

function withSuspense(Component: ComponentType) {
  return function SuspendedRoute() {
    return (
      <Suspense fallback={<PendingSpinner />}>
        <Component />
      </Suspense>
    )
  }
}

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

const signupDeniedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/signup-denied",
  component: SignupDeniedPage,
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
  component: withSuspense(DashboardPage),
})

const filesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/dashboard/files",
  validateSearch: (search: Record<string, unknown>) => ({
    folderId:
      typeof search.folderId === "string" && search.folderId.length > 0
        ? search.folderId
        : undefined,
    previewFileId:
      typeof search.previewFileId === "string" && search.previewFileId.length > 0
        ? search.previewFileId
        : undefined,
  }),
  component: withSuspense(FilesPage),
})

const membersRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/dashboard/members",
  component: withSuspense(MembersPage),
})

const auditRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/dashboard/audit",
  component: withSuspense(AuditPage),
})

const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/dashboard/settings",
  component: withSuspense(SettingsPage),
})

const shareManagementRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/dashboard/shares",
  component: withSuspense(ShareManagementPage),
})

const trashRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/dashboard/trash",
  component: withSuspense(TrashPage),
})

const platformRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/dashboard/platform",
  component: withSuspense(PlatformAdminPage),
})

const shareAccessRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/share/$shareId",
  component: withSuspense(ShareAccessPage),
})

const routeTree = rootRoute.addChildren([
  loginRoute,
  joinRoute,
  signupDeniedRoute,
  shareAccessRoute,
  appRoute.addChildren([
    homeRoute,
    dashboardRoute,
    filesRoute,
    membersRoute,
    auditRoute,
    settingsRoute,
    shareManagementRoute,
    trashRoute,
    platformRoute,
  ]),
])

export const router = createRouter({
  routeTree,
  defaultPendingComponent: PendingSpinner,
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
