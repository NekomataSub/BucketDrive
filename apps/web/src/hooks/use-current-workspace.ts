/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-non-null-assertion */
import { useState, useEffect, useMemo } from "react"
import { useWorkspaces } from "@/lib/api"

export interface WorkspaceData {
  id: string
  name: string
  slug: string
  ownerId: string
  role: string
  storageQuotaBytes: number
  createdAt: string
  updatedAt: string
}

function getStoredWorkspaceId(): string | null {
  try {
    return localStorage.getItem("bucketdrive-workspace-id")
  } catch {
    return null
  }
}

function setStoredWorkspaceId(id: string | null) {
  try {
    if (id) {
      localStorage.setItem("bucketdrive-workspace-id", id)
    } else {
      localStorage.removeItem("bucketdrive-workspace-id")
    }
  } catch {
    // ignore
  }
}

export function useCurrentWorkspace() {
  const { data: workspacesData, isLoading, isError, error } = useWorkspaces()
  const workspaces = useMemo(() => workspacesData?.data ?? [], [workspacesData])
  const [currentId, setCurrentId] = useState<string | null>(getStoredWorkspaceId)

  useEffect(() => {
    if (workspaces.length > 0) {
      const exists = workspaces.find((w) => w.id === currentId)
      if (!exists) {
        setCurrentId(workspaces[0]!.id)
      }
    }
  }, [workspaces, currentId])

  useEffect(() => {
    setStoredWorkspaceId(currentId)
  }, [currentId])

  const workspace = useMemo(() => {
    return workspaces.find((w) => w.id === currentId) ?? workspaces[0] ?? null
  }, [workspaces, currentId])

  const workspaceId = workspace?.id ?? null
  const role = workspace?.role ?? null

  return {
    workspace,
    workspaceId,
    role,
    isLoading,
    isError,
    error,
    currentId,
    setCurrentId,
    workspaces,
  }
}
