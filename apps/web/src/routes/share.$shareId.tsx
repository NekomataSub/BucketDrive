/* eslint-disable @typescript-eslint/no-confusing-void-expression, @typescript-eslint/no-deprecated, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { useState, useCallback } from "react"
import { useParams } from "@tanstack/react-router"
import { FolderOpen, Download, Lock, LockKeyhole, ChevronRight, AlertTriangle, ArrowLeft } from "lucide-react"
import {
  useShareInfo,
  useAccessShare,
  useBrowseShare,
  type ShareInfoData,
  type ShareAccessResult,
  type ShareBrowseResult,
} from "@/lib/api"
import { ApiRequestError } from "@/lib/api"

export function ShareAccessPage() {
  const params = useParams({ from: "/share/$shareId" })
  const shareId = params.shareId

  const { data: info, isLoading, isError, error } = useShareInfo(shareId)
  const [password, setPassword] = useState("")
  const [submittedPassword, setSubmittedPassword] = useState<string | null>(null)
  const [accessData, setAccessData] = useState<ShareAccessResult | null>(null)
  const [accessError, setAccessError] = useState<string | null>(null)

  const accessMutation = useAccessShare(shareId)
  const browseMutation = useBrowseShare(shareId)
  const [browseData, setBrowseData] = useState<ShareBrowseResult | null>(null)
  const [browsePassword, setBrowsePassword] = useState<string | null>(null)

  const handleAccess = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setAccessError(null)
      try {
        const result = await accessMutation.mutateAsync({ password: password || undefined })
        setAccessData(result)
        setSubmittedPassword(password)
        setBrowsePassword(password)
        if (result.resourceType === "folder") {
          setBrowseData({
            resourceName: result.resourceName,
            currentFolderId: null,
            breadcrumbs: [],
            files: result.files ?? [],
            folders: result.folders ?? [],
            brandingLogoUrl: result.brandingLogoUrl,
            brandingName: result.brandingName,
          })
        }
      } catch (err) {
        if (err instanceof ApiRequestError) {
          setAccessError(err.message)
        } else {
          setAccessError("An unexpected error occurred")
        }
      }
    },
    [password, accessMutation],
  )

  const handleBrowse = useCallback(
    async (folderId: string | null) => {
      try {
        const result = await browseMutation.mutateAsync({
          folderId: folderId ?? undefined,
          password: browsePassword || undefined,
        })
        setBrowseData(result)
      } catch (err) {
        if (err instanceof ApiRequestError) {
          setAccessError(err.message)
        }
      }
    },
    [browsePassword, browseMutation],
  )

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    )
  }

  if (isError) {
    return <ShareErrorState error={error} />
  }

  if (!info) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary">
        <p className="text-sm text-text-tertiary">Share not found</p>
      </div>
    )
  }

  if (!info.isActive) {
    return (
      <ShareErrorFrame
        icon={<LockKeyhole className="h-8 w-8 text-error" />}
        title="Share revoked"
        message="This share link has been revoked and is no longer available."
      />
    )
  }

  if (info.expiresAt && new Date(info.expiresAt) < new Date()) {
    return (
      <ShareErrorFrame
        icon={<LockKeyhole className="h-8 w-8 text-error" />}
        title="Share expired"
        message="This share link has expired."
      />
    )
  }

  if (info.hasPassword && !submittedPassword) {
    return (
      <SharePasswordForm
        resourceName={info.resourceName}
        resourceType={info.resourceType}
        password={password}
        onPasswordChange={setPassword}
        onSubmit={handleAccess}
        isLoading={accessMutation.isPending}
        error={accessError}
        info={info}
      />
    )
  }

  if (accessData && accessData.signedUrl) {
    return (
      <ShareExternalDirect
        resourceName={accessData.resourceName}
        signedUrl={accessData.signedUrl}
        shareId={shareId}
        info={info}
      />
    )
  }

  if (accessData?.resourceType === "folder" || info.resourceType === "folder") {
    if (info.hasPassword && !accessData) {
      return (
        <SharePasswordForm
          resourceName={info.resourceName}
          resourceType={info.resourceType}
          password={password}
          onPasswordChange={setPassword}
          onSubmit={handleAccess}
          isLoading={accessMutation.isPending}
          error={accessError}
          info={info}
        />
      )
    }

    return (
      <ShareExternalExplorer
        info={info}
        browseData={browseData ?? { resourceName: info.resourceName, currentFolderId: null, breadcrumbs: [], files: [], folders: [], brandingLogoUrl: info.brandingLogoUrl, brandingName: info.brandingName }}
        browseMutation={browseMutation}
        onBrowse={handleBrowse}
        accessPassword={browsePassword}
        error={accessError}
      />
    )
  }

  if (!info.hasPassword) {
    return (
      <SharePasswordForm
        resourceName={info.resourceName}
        resourceType={info.resourceType}
        password={password}
        onPasswordChange={setPassword}
        onSubmit={handleAccess}
        isLoading={accessMutation.isPending}
        error={accessError}
        noPassword
        info={info}
      />
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary">
      <p className="text-sm text-text-tertiary">Loading share...</p>
    </div>
  )
}

function ShareErrorFrame({
  icon,
  title,
  message,
}: {
  icon: React.ReactNode
  title: string
  message: string
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg-primary p-6">
      {icon}
      <div className="text-center">
        <h1 className="text-lg font-semibold text-text-primary">{title}</h1>
        <p className="mt-1 text-sm text-text-secondary">{message}</p>
      </div>
    </div>
  )
}

function ShareErrorState({ error }: { error: unknown }) {
  if (error instanceof ApiRequestError) {
    if (error.code === "SHARE_REVOKED") {
      return (
        <ShareErrorFrame
          icon={<LockKeyhole className="h-8 w-8 text-error" />}
          title="Share revoked"
          message="This share link has been revoked."
        />
      )
    }
    if (error.code === "SHARE_EXPIRED") {
      return (
        <ShareErrorFrame
          icon={<LockKeyhole className="h-8 w-8 text-error" />}
          title="Share expired"
          message="This share link has expired."
        />
      )
    }
    if (error.code === "SHARE_LOCKED") {
      return (
        <ShareErrorFrame
          icon={<Lock className="h-8 w-8 text-warning" />}
          title="Share locked"
          message={error.message}
        />
      )
    }
    return (
      <ShareErrorFrame
        icon={<AlertTriangle className="h-8 w-8 text-error" />}
        title="Not found"
        message={error.message}
      />
    )
  }
  return (
    <ShareErrorFrame
      icon={<AlertTriangle className="h-8 w-8 text-error" />}
      title="Not found"
      message="This share link could not be found."
    />
  )
}

function SharePasswordForm({
  resourceName,
  resourceType,
  password,
  onPasswordChange,
  onSubmit,
  isLoading,
  error,
  noPassword,
  info,
}: {
  resourceName: string
  resourceType: "file" | "folder"
  password: string
  onPasswordChange: (value: string) => void
  onSubmit: (e: React.FormEvent) => void
  isLoading: boolean
  error: string | null
  noPassword?: boolean
  info?: ShareInfoData
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-bg-primary p-6">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-hover">
        <FolderOpen className="h-8 w-8 text-accent" />
      </div>
      <div className="text-center">
        <h1 className="text-xl font-semibold text-text-primary">{resourceName}</h1>
        <p className="mt-1 text-sm text-text-secondary">
          {info?.brandingName || "BucketDrive"}
        </p>
      </div>

      {noPassword ? (
        <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
          <p className="text-center text-sm text-text-tertiary">
            This {resourceType} is shared via a direct link.
          </p>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-xl bg-accent px-6 py-3 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
          >
            {isLoading ? "Loading..." : "Access shared content"}
          </button>
          {error && (
            <p className="rounded-lg bg-error/10 border border-error/20 p-3 text-sm text-error">
              {error}
            </p>
          )}
        </form>
      ) : (
        <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
          <div className="space-y-2">
            <label htmlFor="password" className="text-xs font-medium text-text-secondary">
              Password required
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                placeholder="Enter share password"
                autoFocus
                className="w-full rounded-lg border border-border-default bg-surface-default py-2.5 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={isLoading || password.length < 4}
            className="w-full rounded-xl bg-accent px-6 py-3 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
          >
            {isLoading ? "Verifying..." : "Access share"}
          </button>
          {error && (
            <p className="rounded-lg bg-error/10 border border-error/20 p-3 text-sm text-error">
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  )
}

function ShareExternalDirect({
  resourceName,
  signedUrl,
  shareId: _shareId,
  info,
}: {
  resourceName: string
  signedUrl: string
  shareId: string
  info: ShareInfoData
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-bg-primary p-6">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-success/10">
        <Download className="h-8 w-8 text-success" />
      </div>
      <div className="text-center">
        <h1 className="text-xl font-semibold text-text-primary">{resourceName}</h1>
        <p className="mt-2 text-sm text-text-secondary">
          This file has been shared with you via{" "}
          <span className="font-medium text-text-primary">
            {info.brandingName || "BucketDrive"}
          </span>
        </p>
      </div>
      <a
        href={signedUrl}
        download={resourceName}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-medium text-white transition-colors hover:opacity-90"
      >
        <Download className="h-4 w-4" />
        Download file
      </a>
      {info.expiresAt && (
        <p className="text-xs text-text-tertiary">
          Link expires: {new Date(info.expiresAt).toLocaleString()}
        </p>
      )}
      <div className="flex h-8 items-center gap-1 rounded-full bg-surface-hover px-3">
        <FolderOpen className="h-3.5 w-3.5 text-text-tertiary" />
        <span className="text-xs font-medium text-text-tertiary">
          {info.brandingName || "BucketDrive"}
        </span>
      </div>
    </div>
  )
}

function ShareExternalExplorer({
  info,
  browseData,
  browseMutation,
  onBrowse,
  accessPassword: _accessPassword,
  error,
}: {
  info: ShareInfoData
  browseData: ShareBrowseResult
  browseMutation: ReturnType<typeof useBrowseShare>
  onBrowse: (folderId: string | null) => void
  accessPassword: string | null
  error: string | null
}) {
  return (
    <div className="flex min-h-screen flex-col bg-bg-primary">
      <header className="border-b border-border-muted bg-bg-secondary px-6 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-hover">
              <FolderOpen className="h-4 w-4 text-accent" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-text-primary">{info.resourceName}</h1>
              <p className="text-xs text-text-tertiary">Shared folder</p>
            </div>
          </div>
          {info.brandingName && (
            <div className="flex items-center gap-2">
              {info.brandingLogoUrl && (
                <img
                  src={info.brandingLogoUrl}
                  alt=""
                  className="h-5 w-5 rounded object-contain"
                />
              )}
              <span className="text-xs font-medium text-text-secondary">
                {info.brandingName}
              </span>
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-col flex-1 p-4">
        <nav className="mb-4 flex items-center gap-1 text-xs text-text-secondary">
          {browseData.currentFolderId ? (
            <button
              onClick={() => onBrowse(null)}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-surface-hover transition-colors"
            >
              <ArrowLeft className="h-3 w-3" />
              <span className="font-medium text-text-primary">{info.resourceName}</span>
            </button>
          ) : (
            <span className="font-medium text-text-primary px-1.5 py-0.5">{info.resourceName}</span>
          )}
          {browseData.breadcrumbs.slice(1).map((crumb) => (
            <span key={crumb.id} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3 text-text-tertiary" />
              <button
                onClick={() => onBrowse(crumb.id)}
                className="rounded px-1.5 py-0.5 hover:bg-surface-hover transition-colors"
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </nav>

        {error && (
          <div className="mb-4 rounded-lg bg-error/10 border border-error/20 p-3">
            <p className="text-sm text-error">{error}</p>
          </div>
        )}

        {browseMutation.isPending && (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        )}

        <div className="flex-1 overflow-hidden rounded-xl border border-border-default">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-muted bg-surface-default">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-text-tertiary">Name</th>
                <th className="hidden px-4 py-2.5 text-left text-xs font-medium text-text-tertiary sm:table-cell">
                  Type
                </th>
              </tr>
            </thead>
            <tbody>
              {browseData.folders.length === 0 && browseData.files.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-4 py-8 text-center text-sm text-text-tertiary">
                    This folder is empty
                  </td>
                </tr>
              )}
              {browseData.folders.map((folder) => (
                <tr
                  key={folder.id}
                  className="border-b border-border-muted transition-colors last:border-b-0 hover:bg-surface-hover cursor-pointer"
                  onClick={() => onBrowse(folder.id)}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{folderIcon}</span>
                      <span className="text-sm font-medium text-text-primary">{folder.name}</span>
                    </div>
                  </td>
                  <td className="hidden px-4 py-2.5 sm:table-cell">
                    <span className="rounded-full bg-surface-hover px-2 py-0.5 text-xs text-text-secondary capitalize">
                      Folder
                    </span>
                  </td>
                </tr>
              ))}
              {browseData.files.map((file) => (
                <tr key={file.id} className="border-b border-border-muted transition-colors last:border-b-0 hover:bg-surface-hover">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{fileIcon}</span>
                      <div>
                        <p className="truncate text-sm font-medium text-text-primary">{file.name}</p>
                        <p className="text-xs text-text-tertiary">{formatFileSize(file.sizeBytes)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-4 py-2.5 sm:table-cell">
                    <span className="rounded-full bg-surface-hover px-2 py-0.5 text-xs text-text-secondary">
                      {file.mimeType.split("/")[0] ?? "File"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

const folderIcon = "\uD83D\uDCC2"
const fileIcon = "\uD83D\uDCC4"

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}
