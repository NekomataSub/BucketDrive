/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { useEffect } from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  useWorkspaces,
  usePlatformSettings,
  useJoinPlatform,
  useCreateWorkspace,
  useStorageStatus,
  usePlatformMe,
} from "@/lib/api"
import { HardDrive, Plus } from "lucide-react"

export function OnboardingPage() {
  const navigate = useNavigate()
  const { data: workspacesData, isLoading: workspacesLoading } = useWorkspaces()
  const { data: platformSettings } = usePlatformSettings()
  const { data: storageStatus } = useStorageStatus()
  const { data: platformMe } = usePlatformMe()
  const joinPlatform = useJoinPlatform()
  const createWorkspace = useCreateWorkspace()

  const workspaces = workspacesData?.data ?? []

  useEffect(() => {
    if (workspaces.length > 0) {
      void navigate({ to: "/dashboard" })
    }
  }, [workspaces, navigate])

  if (workspacesLoading || joinPlatform.isPending) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg-primary">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    )
  }

  const canCreate =
    platformSettings?.allowUserWorkspaceCreation ||
    platformMe?.canCreateWorkspaces ||
    platformMe?.isPlatformAdmin
  const canJoinDefault = Boolean(platformSettings?.enablePublicSignup && platformSettings.defaultWorkspaceId)

  return (
    <div className="flex h-screen items-center justify-center bg-bg-primary p-6">
      <div className="w-full max-w-md rounded-2xl border border-border-default bg-surface-default p-8 shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
          <HardDrive className="h-6 w-6 text-accent" />
        </div>
        <h1 className="mt-4 text-center text-xl font-semibold text-text-primary">
          Welcome to {platformSettings?.platformName ?? "BucketDrive"}
        </h1>
        <p className="mt-2 text-center text-sm text-text-secondary">
          {canJoinDefault
            ? "Join the default workspace to finish your first setup."
            : canCreate
              ? "Get started by creating your first workspace."
              : "You do not have access to any workspace yet. Please wait for an invitation from your administrator."}
        </p>

        <div className="mt-5 rounded-xl border border-border-default bg-bg-tertiary p-4 text-xs text-text-secondary">
          <div className="flex items-center justify-between gap-3">
            <span>Storage provider</span>
            <span className="font-medium text-text-primary">
              {storageStatus
                ? [String(storageStatus.provider), String(storageStatus.bucketName)].join(" · ")
                : "Checking..."}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span>R2 binding</span>
            <span className={storageStatus?.bucketBinding ? "text-success" : "text-warning"}>
              {storageStatus?.bucketBinding ? "Connected" : "Missing"}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span>Signed R2 URLs</span>
            <span className={storageStatus?.presignedUrls ? "text-success" : "text-warning"}>
              {storageStatus?.presignedUrls ? "Enabled" : "Needs credentials"}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span>Local CORS origin</span>
            <span className="truncate text-text-primary">{storageStatus?.expectedCorsOrigin ?? "http://localhost:5173"}</span>
          </div>
        </div>

        {canJoinDefault && (
          <button
            type="button"
            disabled={joinPlatform.isPending}
            onClick={() => {
              joinPlatform.mutate(undefined, {
                onSuccess: () => {
                  void navigate({ to: "/dashboard/files" })
                },
              })
            }}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <HardDrive className="h-4 w-4" />
            {joinPlatform.isPending ? "Joining..." : "Join default workspace"}
          </button>
        )}

        {canCreate && !canJoinDefault && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const formData = new FormData(e.currentTarget)
              const name = formData.get("name") as string
              if (name.trim()) {
                createWorkspace.mutate({ name: name.trim() }, {
                  onSuccess: () => {
                    void navigate({ to: "/dashboard/files" })
                  },
                })
              }
            }}
            className="mt-6 space-y-4"
          >
            <div>
              <label htmlFor="workspace-name" className="block text-sm font-medium text-text-secondary">
                Workspace name
              </label>
              <input
                id="workspace-name"
                name="name"
                type="text"
                required
                maxLength={100}
                placeholder="My Team"
                className="mt-1 block w-full rounded-xl border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </div>
            {createWorkspace.isError && (
              <p className="text-sm text-error">{createWorkspace.error?.message ?? "Failed to create workspace"}</p>
            )}
            <button
              type="submit"
              disabled={createWorkspace.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              {createWorkspace.isPending ? "Creating..." : "Create workspace"}
            </button>
          </form>
        )}

        {joinPlatform.isError && (
          <p className="mt-3 text-center text-sm text-error">
            {joinPlatform.error?.message ?? "Failed to join workspace"}
          </p>
        )}

        {!canCreate && !canJoinDefault && !platformSettings?.enablePublicSignup && (
          <div className="mt-6 rounded-xl border border-border-default bg-bg-tertiary p-4 text-center">
            <p className="text-sm text-text-secondary">
              This platform requires an invitation to join.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
