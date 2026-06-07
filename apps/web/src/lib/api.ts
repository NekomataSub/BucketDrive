import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query"
import type {
  DashboardAuditItem,
  DashboardOverview,
  FileObject,
  Folder,
  ShareDashboardItem,
  ShareLink,
  SharesListScope,
  Tag,
  TrashItem,
  WorkspaceSettings,
  WorkspaceMemberListItem,
  WorkspaceRole,
  InvitationListItem,
  BatchOperationResponse,
} from "@bucketdrive/shared"

interface ApiError {
  code: string
  message: string
}

function isApiError(value: unknown): value is ApiError {
  if (typeof value !== "object" || value === null) return false

  const error = value as Record<string, unknown>
  return typeof error.code === "string" && typeof error.message === "string"
}

function requireId(value: string | null, label: string): string {
  if (!value) {
    throw new Error(`${label} is required`)
  }

  return value
}

function buildWorkspacePath(workspaceId: string | null, suffix: string): string {
  void workspaceId
  return `/api${suffix}`
}

class ApiClient {
  private async request<T>(url: string, options?: RequestInit): Promise<T> {
    const headers = new Headers(options?.headers)

    const body = options?.body
    const isFormData = typeof FormData !== "undefined" && body instanceof FormData
    if (body !== undefined && !isFormData && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json")
    }

    const res = await fetch(url, {
      credentials: "include",
      ...options,
      headers,
    })

    const text = await res.text()
    let data: unknown = null
    if (text) {
      try {
        data = JSON.parse(text) as unknown
      } catch {
        data = { code: "INVALID_RESPONSE", message: text }
      }
    }

    if (!res.ok) {
      if (isApiError(data)) {
        throw new ApiRequestError(data.code, data.message, res.status)
      }

      throw new ApiRequestError("UNKNOWN", "Request failed", res.status)
    }

    return data as T
  }

  async get<T>(url: string): Promise<T> {
    return this.request<T>(url)
  }

  async post<T>(url: string, body?: unknown): Promise<T> {
    return this.request<T>(url, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }

  async patch<T>(url: string, body?: unknown): Promise<T> {
    return this.request<T>(url, {
      method: "PATCH",
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }

  async delete<T>(url: string): Promise<T> {
    return this.request<T>(url, { method: "DELETE" })
  }

  async postBlob<T>(url: string, blob: Blob): Promise<T> {
    const headers = new Headers()
    if (blob.type) {
      headers.set("Content-Type", blob.type)
    }

    return this.request<T>(url, {
      method: "POST",
      body: blob,
      headers,
    })
  }

  async postForm<T>(url: string, form: FormData): Promise<T> {
    return this.request<T>(url, {
      method: "POST",
      body: form,
    })
  }
}

export class ApiRequestError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message)
    this.name = "ApiRequestError"
  }
}

export const api = new ApiClient()

interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

interface ListFilesResponse {
  data: FileObject[]
  meta: PaginationMeta
}

interface InitiateUploadRequest {
  fileName: string
  mimeType: string
  sizeBytes: number
  folderId?: string | null
  checksum?: string
}

interface InitiateUploadResponse {
  uploadId: string
  sessionId?: string
  signedUrl?: string
  expiresAt: string
  storageKey: string
  partSize?: number
  totalParts?: number
}

interface CompleteUploadRequest {
  uploadId: string
  fileName: string
  mimeType: string
  folderId?: string | null
  parts?: Array<{ partNumber: number; etag: string; sizeBytes: number }>
}

interface DownloadUrlResponse {
  signedUrl: string
  expiresAt: string
  fileName: string
  publicUrl?: string
}

interface PreviewUrlResponse {
  signedUrl: string
  expiresAt: string
  fileName: string
  mimeType: string
}

interface StorageStatusResponse {
  provider: "r2-s3" | "r2-binding"
  bucketName: string
  bucketBinding: boolean
  s3Credentials: boolean
  presignedUrls: boolean
  endpointConfigured: boolean
  expectedCorsOrigin: string
}

interface ImportR2Response {
  scanned: number
  imported: number
  updated: number
  deleted: number
  skipped: number
  failed: number
}

export interface ThumbnailUrlResponse {
  signedUrl: string
  expiresAt: string
}

interface ListFoldersResponse {
  data: Folder[]
  meta: PaginationMeta
}

interface ListTrashResponse {
  data: TrashItem[]
  meta: PaginationMeta
}

interface ListTagsResponse {
  data: Tag[]
}

interface SearchFilesResponse {
  data: FileObject[]
  meta: PaginationMeta
}

interface BreadcrumbItem {
  id: string | null
  name: string
}

export interface UseFilesOptions {
  folderId?: string | null
  sort?: "name" | "created_at" | "size" | "type"
  order?: "asc" | "desc"
  page?: number
  limit?: number
  enabled?: boolean
}

export interface UseSearchOptions {
  q?: string
  type?: "all" | "documents" | "images" | "videos" | "audio" | "archives"
  tags?: string[]
  favorite?: boolean
  sort?: "relevance" | "name" | "created_at" | "size" | "type"
  order?: "asc" | "desc"
  page?: number
  limit?: number
  enabled?: boolean
}

export interface UseTrashOptions {
  q?: string
  sort?: "deleted_at" | "name" | "location" | "size"
  order?: "asc" | "desc"
  page?: number
  limit?: number
}

function getCachedFolderId(options: unknown): string | null {
  if (typeof options !== "object" || options === null) return null
  const folderId = (options as UseFilesOptions).folderId
  return folderId ?? null
}

function compareFilesForOptions(a: FileObject, b: FileObject, options: UseFilesOptions): number {
  const direction = options.order === "desc" ? -1 : 1
  const sort = options.sort ?? "name"

  if (sort === "size") {
    return (a.sizeBytes - b.sizeBytes) * direction
  }

  if (sort === "created_at") {
    return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * direction
  }

  if (sort === "type") {
    const typeCompare = a.mimeType.localeCompare(b.mimeType)
    if (typeCompare !== 0) return typeCompare * direction
  }

  return (
    a.originalName.localeCompare(b.originalName, undefined, { sensitivity: "base" }) * direction
  )
}

export function upsertCompletedFileInFilesCache(
  queryClient: QueryClient,
  completedFile: FileObject,
): void {
  const completedFolderId = completedFile.folderId ?? null
  const queries = queryClient.getQueryCache().findAll({
    queryKey: ["files"],
  })

  for (const query of queries) {
    const options = query.queryKey[2] as UseFilesOptions | undefined
    if (getCachedFolderId(options) !== completedFolderId) continue

    queryClient.setQueryData<ListFilesResponse>(query.queryKey, (current) => {
      if (!current) return current

      const existingIndex = current.data.findIndex((file) => file.id === completedFile.id)
      if (existingIndex >= 0) {
        const data = current.data.map((file) =>
          file.id === completedFile.id ? completedFile : file,
        )
        return { ...current, data }
      }

      if (options?.page !== undefined && options.page > 1) {
        return {
          ...current,
          meta: { ...current.meta, total: current.meta.total + 1 },
        }
      }

      const sorted = [completedFile, ...current.data]
        .sort((a, b) => compareFilesForOptions(a, b, options ?? {}))
        .slice(0, options?.limit ?? current.data.length + 1)

      return {
        ...current,
        data: sorted,
        meta: { ...current.meta, total: current.meta.total + 1 },
      }
    })
  }
}

export function useFiles(
  workspaceId: string | null,
  options?: UseFilesOptions,
): UseQueryResult<ListFilesResponse, ApiRequestError> {
  return useQuery<ListFilesResponse, ApiRequestError>({
    queryKey: ["files", workspaceId, options],
    queryFn: () => {
      const params = new URLSearchParams()

      if (options?.folderId) params.set("folderId", options.folderId)
      if (options?.sort) params.set("sort", options.sort)
      if (options?.order) params.set("order", options.order)
      if (options?.page !== undefined) params.set("page", String(options.page))
      if (options?.limit !== undefined) params.set("limit", String(options.limit))

      const qs = params.toString()
      return api.get<ListFilesResponse>(
        `${buildWorkspacePath(workspaceId, "/files")}${qs ? `?${qs}` : ""}`,
      )
    },
    enabled: options?.enabled !== false,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })
}

export function useSearchFiles(
  workspaceId: string | null,
  options?: UseSearchOptions,
): UseQueryResult<SearchFilesResponse, ApiRequestError> {
  return useQuery<SearchFilesResponse, ApiRequestError>({
    queryKey: ["search", workspaceId, options],
    queryFn: () => {
      const params = new URLSearchParams()

      if (options?.q) params.set("q", options.q)
      if (options?.type) params.set("type", options.type)
      if (options?.tags) {
        for (const tagId of options.tags) {
          params.append("tags", tagId)
        }
      }
      if (options?.favorite !== undefined) params.set("favorite", String(options.favorite))
      if (options?.sort) params.set("sort", options.sort)
      if (options?.order) params.set("order", options.order)
      if (options?.page !== undefined) params.set("page", String(options.page))
      if (options?.limit !== undefined) params.set("limit", String(options.limit))

      const qs = params.toString()
      return api.get<SearchFilesResponse>(
        `${buildWorkspacePath(workspaceId, "/search")}${qs ? `?${qs}` : ""}`,
      )
    },
    enabled: options?.enabled !== false,
    staleTime: 30_000,
  })
}

export function useFolders(
  workspaceId: string | null,
  parentFolderId?: string | null,
  enabled = true,
): UseQueryResult<ListFoldersResponse, ApiRequestError> {
  return useQuery<ListFoldersResponse, ApiRequestError>({
    queryKey: ["folders", workspaceId, parentFolderId],
    queryFn: () => {
      const params = new URLSearchParams()

      if (parentFolderId) params.set("parentFolderId", parentFolderId)

      const qs = params.toString()
      return api.get<ListFoldersResponse>(
        `${buildWorkspacePath(workspaceId, "/folders")}${qs ? `?${qs}` : ""}`,
      )
    },
    enabled: enabled,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })
}

export function useTrash(
  workspaceId: string | null,
  options?: UseTrashOptions,
): UseQueryResult<ListTrashResponse, ApiRequestError> {
  return useQuery<ListTrashResponse, ApiRequestError>({
    queryKey: ["trash", workspaceId, options],
    queryFn: () => {
      const params = new URLSearchParams()

      if (options?.q) params.set("q", options.q)
      if (options?.sort) params.set("sort", options.sort)
      if (options?.order) params.set("order", options.order)
      if (options?.page !== undefined) params.set("page", String(options.page))
      if (options?.limit !== undefined) params.set("limit", String(options.limit))

      const qs = params.toString()
      return api.get<ListTrashResponse>(
        `${buildWorkspacePath(workspaceId, "/trash")}${qs ? `?${qs}` : ""}`,
      )
    },
    enabled: true,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })
}

export function useBreadcrumbs(
  workspaceId: string | null,
  folderId: string | null,
): UseQueryResult<BreadcrumbItem[], ApiRequestError> {
  return useQuery<BreadcrumbItem[], ApiRequestError>({
    queryKey: ["breadcrumbs", workspaceId, folderId],
    queryFn: () =>
      api.get<BreadcrumbItem[]>(
        buildWorkspacePath(workspaceId, `/folders/${requireId(folderId, "folderId")}/breadcrumbs`),
      ),
    enabled: folderId !== null,
  })
}

export function useInitiateUpload(): UseMutationResult<
  InitiateUploadResponse,
  ApiRequestError,
  InitiateUploadRequest & { workspaceId: string }
> {
  const queryClient = useQueryClient()

  return useMutation<
    InitiateUploadResponse,
    ApiRequestError,
    InitiateUploadRequest & { workspaceId: string }
  >({
    mutationFn: ({ workspaceId, ...body }) =>
      api.post<InitiateUploadResponse>(buildWorkspacePath(workspaceId, "/files/upload"), body),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["files", variables.workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["search", variables.workspaceId] })
      void queryClient.invalidateQueries({
        queryKey: ["dashboard-overview", variables.workspaceId],
      })
    },
  })
}

export function useCompleteUpload(): UseMutationResult<
  FileObject,
  ApiRequestError,
  CompleteUploadRequest & { workspaceId: string }
> {
  const queryClient = useQueryClient()

  return useMutation<FileObject, ApiRequestError, CompleteUploadRequest & { workspaceId: string }>({
    mutationFn: ({ workspaceId, ...body }) =>
      api.post<FileObject>(buildWorkspacePath(workspaceId, "/files/upload/complete"), body),
    onSuccess: (data, variables) => {
      upsertCompletedFileInFilesCache(queryClient, data)
      void queryClient.invalidateQueries({ queryKey: ["files", variables.workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["search", variables.workspaceId] })
      void queryClient.invalidateQueries({
        queryKey: ["dashboard-overview", variables.workspaceId],
      })
    },
  })
}

interface GetUploadSessionResponse {
  uploadId: string
  sessionId: string
  status: "initiated" | "uploading" | "completed" | "cancelled"
  totalParts: number
  partSize: number
  partsCompleted: number
  completedParts: Array<{ partNumber: number; etag: string; sizeBytes: number }>
  storageKey: string
  expiresAt: string
}

interface GetPartSignedUrlsRequest {
  partNumbers: number[]
}

interface GetPartSignedUrlsResponse {
  uploadId: string
  sessionId: string
  signedUrls: Array<{ partNumber: number; signedUrl: string; expiresAt: string }>
}

interface CancelUploadResponse {
  success: boolean
  message: string
}

interface BatchUploadItemRequest {
  clientId: string
  relativePath: string
  mimeType: string
  sizeBytes: number
  checksum?: string
}

interface BatchUploadFolderCreated {
  id: string
  path: string
}

interface BatchUploadItemResponse {
  clientId: string
  fileId: string
  folderId: string | null
  uploadId: string
  sessionId?: string
  signedUrl?: string
  expiresAt: string
  storageKey: string
  partSize?: number
  totalParts?: number
}

interface BatchUploadResponse {
  folders: BatchUploadFolderCreated[]
  items: BatchUploadItemResponse[]
}

export function useGetUploadSession(
  workspaceId: string | null,
  sessionId: string | null,
): UseQueryResult<GetUploadSessionResponse, ApiRequestError> {
  return useQuery<GetUploadSessionResponse, ApiRequestError>({
    queryKey: ["upload-session", workspaceId, sessionId],
    queryFn: () =>
      api.get<GetUploadSessionResponse>(
        buildWorkspacePath(workspaceId, `/files/uploads/${requireId(sessionId, "sessionId")}`),
      ),
    enabled: sessionId !== null,
    staleTime: 30_000,
  })
}

export function getUploadSession(
  workspaceId: string | null,
  sessionId: string,
): Promise<GetUploadSessionResponse> {
  return api.get<GetUploadSessionResponse>(
    buildWorkspacePath(workspaceId, `/files/uploads/${sessionId}`),
  )
}

export function useGetPartSignedUrls(
  workspaceId: string | null,
): UseMutationResult<
  GetPartSignedUrlsResponse,
  ApiRequestError,
  GetPartSignedUrlsRequest & { sessionId: string }
> {
  return useMutation<
    GetPartSignedUrlsResponse,
    ApiRequestError,
    GetPartSignedUrlsRequest & { sessionId: string }
  >({
    mutationFn: ({ sessionId, ...body }) =>
      api.post<GetPartSignedUrlsResponse>(
        buildWorkspacePath(workspaceId, `/files/uploads/${sessionId}/parts`),
        body,
      ),
  })
}

export function useCancelUpload(
  workspaceId: string | null,
): UseMutationResult<CancelUploadResponse, ApiRequestError, { sessionId: string }> {
  return useMutation<CancelUploadResponse, ApiRequestError, { sessionId: string }>({
    mutationFn: ({ sessionId }) =>
      api.delete<CancelUploadResponse>(
        buildWorkspacePath(workspaceId, `/files/uploads/${sessionId}`),
      ),
  })
}

export function useBatchUpload(workspaceId: string | null): UseMutationResult<
  BatchUploadResponse,
  ApiRequestError,
  {
    items: BatchUploadItemRequest[]
    parentFolderId?: string | null
    emptyFolders?: string[]
  }
> {
  const queryClient = useQueryClient()

  return useMutation<
    BatchUploadResponse,
    ApiRequestError,
    {
      items: BatchUploadItemRequest[]
      parentFolderId?: string | null
      emptyFolders?: string[]
    }
  >({
    mutationFn: (body) =>
      api.post<BatchUploadResponse>(buildWorkspacePath(workspaceId, "/files/batch-upload"), body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["files", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["folders", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["search", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["dashboard-overview", workspaceId] })
    },
  })
}

export function useBatchTrash(
  workspaceId: string | null,
): UseMutationResult<
  BatchOperationResponse,
  ApiRequestError,
  { files: string[]; folders: string[] }
> {
  const queryClient = useQueryClient()

  return useMutation<
    BatchOperationResponse,
    ApiRequestError,
    { files: string[]; folders: string[] }
  >({
    mutationFn: (body) => api.post<BatchOperationResponse>("/api/batch/trash", body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["files", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["folders", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["search", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["trash", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["shares", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["dashboard-overview", workspaceId] })
    },
  })
}

export function useBatchRestore(
  workspaceId: string | null,
): UseMutationResult<
  BatchOperationResponse,
  ApiRequestError,
  { files: string[]; folders: string[] }
> {
  const queryClient = useQueryClient()

  return useMutation<
    BatchOperationResponse,
    ApiRequestError,
    { files: string[]; folders: string[] }
  >({
    mutationFn: (body) => api.post<BatchOperationResponse>("/api/batch/restore", body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["trash", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["files", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["folders", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["search", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["shares", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["dashboard-overview", workspaceId] })
    },
  })
}

export function useBatchPermanentDelete(
  workspaceId: string | null,
): UseMutationResult<
  BatchOperationResponse,
  ApiRequestError,
  { files: string[]; folders: string[] }
> {
  const queryClient = useQueryClient()

  return useMutation<
    BatchOperationResponse,
    ApiRequestError,
    { files: string[]; folders: string[] }
  >({
    mutationFn: (body) => api.post<BatchOperationResponse>("/api/batch/permanent-delete", body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["trash", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["files", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["folders", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["search", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["shares", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["dashboard-overview", workspaceId] })
    },
  })
}

export function useRestoreAllTrash(
  workspaceId: string | null,
): UseMutationResult<BatchOperationResponse, ApiRequestError, void> {
  const queryClient = useQueryClient()

  return useMutation<BatchOperationResponse, ApiRequestError>({
    mutationFn: () => api.post<BatchOperationResponse>("/api/trash/restore-all"),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["trash", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["files", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["folders", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["search", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["shares", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["dashboard-overview", workspaceId] })
    },
  })
}

export function useEmptyTrash(
  workspaceId: string | null,
): UseMutationResult<BatchOperationResponse, ApiRequestError, void> {
  const queryClient = useQueryClient()

  return useMutation<BatchOperationResponse, ApiRequestError>({
    mutationFn: () => api.post<BatchOperationResponse>("/api/trash/empty"),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["trash", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["files", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["folders", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["search", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["shares", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["dashboard-overview", workspaceId] })
    },
  })
}

export function useBatchMove(
  workspaceId: string | null,
): UseMutationResult<
  BatchOperationResponse,
  ApiRequestError,
  { files: string[]; folders: string[]; targetFolderId: string | null }
> {
  const queryClient = useQueryClient()

  return useMutation<
    BatchOperationResponse,
    ApiRequestError,
    { files: string[]; folders: string[]; targetFolderId: string | null }
  >({
    mutationFn: (body) => api.post<BatchOperationResponse>("/api/batch/move", body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["files", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["folders", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["search", workspaceId] })
    },
  })
}

export function useBatchRevokeShares(
  workspaceId: string | null,
): UseMutationResult<BatchOperationResponse, ApiRequestError, { shareIds: string[] }> {
  const queryClient = useQueryClient()

  return useMutation<BatchOperationResponse, ApiRequestError, { shareIds: string[] }>({
    mutationFn: (body) => api.post<BatchOperationResponse>("/api/batch/shares/revoke", body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["shares", workspaceId] })
    },
  })
}

export function useDownloadUrl(
  workspaceId: string | null,
  fileId: string | null,
): UseQueryResult<DownloadUrlResponse, ApiRequestError> {
  return useQuery<DownloadUrlResponse, ApiRequestError>({
    queryKey: ["download", workspaceId, fileId],
    queryFn: () =>
      api.get<DownloadUrlResponse>(
        buildWorkspacePath(workspaceId, `/files/${requireId(fileId, "fileId")}/download`),
      ),
    enabled: fileId !== null,
  })
}

export function usePreviewUrl(
  workspaceId: string | null,
  fileId: string | null,
): UseQueryResult<PreviewUrlResponse, ApiRequestError> {
  return useQuery<PreviewUrlResponse, ApiRequestError>({
    queryKey: ["preview", workspaceId, fileId],
    queryFn: () =>
      api.get<PreviewUrlResponse>(
        buildWorkspacePath(workspaceId, `/files/${requireId(fileId, "fileId")}/preview`),
      ),
    enabled: fileId !== null,
    staleTime: 60_000,
  })
}

export function useThumbnailUrl(
  workspaceId: string | null,
  fileId: string | null,
): UseQueryResult<ThumbnailUrlResponse, ApiRequestError> {
  return useQuery<ThumbnailUrlResponse, ApiRequestError>({
    queryKey: ["thumbnail", workspaceId, fileId],
    queryFn: () =>
      api.get<ThumbnailUrlResponse>(
        buildWorkspacePath(workspaceId, `/files/${requireId(fileId, "fileId")}/thumbnail`),
      ),
    enabled: fileId !== null,
    staleTime: 60_000,
    retry: (failureCount, error) => error.code === "THUMBNAIL_NOT_FOUND" && failureCount < 5,
    retryDelay: 2_000,
    refetchInterval: (query) => {
      const error = query.state.error
      return error instanceof ApiRequestError && error.code === "THUMBNAIL_NOT_FOUND"
        ? 2_000
        : false
    },
  })
}

interface WorkspaceData {
  id: string
  name: string
  slug: string
  ownerId: string
  role: WorkspaceRole
  storageQuotaBytes: number
  createdAt: string
  updatedAt: string
}

interface WorkspacesResponse {
  data: WorkspaceData[]
}

interface DashboardAuditResponse {
  data: DashboardAuditItem[]
  meta: PaginationMeta
}

interface MembersResponse {
  data: WorkspaceMemberListItem[]
  meta: PaginationMeta
}

const DEFAULT_BUCKET_ID = "00000000-0000-4000-8000-000000000001"

export function useWorkspaces(): UseQueryResult<WorkspacesResponse, ApiRequestError> {
  return useQuery<WorkspacesResponse, ApiRequestError>({
    queryKey: ["workspaces"],
    queryFn: async () => {
      const [me, settings] = await Promise.all([
        api.get<{ id: string; role: WorkspaceRole }>("/api/platform/me"),
        api.get<PlatformSettingsData>("/api/platform/settings"),
      ])
      const createdAt = new Date(0).toISOString()

      return {
        data: [
          {
            id: DEFAULT_BUCKET_ID,
            name: settings.platformName,
            slug: "bucket",
            ownerId: me.id,
            role: me.role,
            storageQuotaBytes: 0,
            createdAt,
            updatedAt: createdAt,
          },
        ],
      }
    },
  })
}

export function useStorageStatus(): UseQueryResult<StorageStatusResponse, ApiRequestError> {
  return useQuery<StorageStatusResponse, ApiRequestError>({
    queryKey: ["storage-status"],
    queryFn: () => api.get<StorageStatusResponse>("/api/storage/status"),
  })
}

export function useImportR2(
  workspaceId: string | null,
): UseMutationResult<ImportR2Response, ApiRequestError, { prefix?: string } | undefined> {
  const queryClient = useQueryClient()

  return useMutation<ImportR2Response, ApiRequestError, { prefix?: string } | undefined>({
    mutationFn: (body) =>
      api.post<ImportR2Response>(buildWorkspacePath(workspaceId, "/files/import-r2"), body ?? {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["files", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["folders", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["search", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["dashboard-overview", workspaceId] })
    },
  })
}

export function useDashboardOverview(
  workspaceId: string | null,
): UseQueryResult<DashboardOverview, ApiRequestError> {
  return useQuery<DashboardOverview, ApiRequestError>({
    queryKey: ["dashboard-overview", workspaceId],
    queryFn: () =>
      api.get<DashboardOverview>(buildWorkspacePath(workspaceId, "/dashboard/overview")),
    enabled: true,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })
}

export interface UseDashboardAuditOptions {
  actorId?: string
  action?: string
  resourceType?: string
  from?: string
  to?: string
  page?: number
  limit?: number
}

export function useDashboardAudit(
  workspaceId: string | null,
  options?: UseDashboardAuditOptions,
): UseQueryResult<DashboardAuditResponse, ApiRequestError> {
  return useQuery<DashboardAuditResponse, ApiRequestError>({
    queryKey: ["dashboard-audit", workspaceId, options],
    queryFn: () => {
      const params = new URLSearchParams()
      if (options?.actorId) params.set("actorId", options.actorId)
      if (options?.action) params.set("action", options.action)
      if (options?.resourceType) params.set("resourceType", options.resourceType)
      if (options?.from) params.set("from", options.from)
      if (options?.to) params.set("to", options.to)
      if (options?.page !== undefined) params.set("page", String(options.page))
      if (options?.limit !== undefined) params.set("limit", String(options.limit))
      const qs = params.toString()
      return api.get<DashboardAuditResponse>(
        `${buildWorkspacePath(workspaceId, "/dashboard/audit")}${qs ? `?${qs}` : ""}`,
      )
    },
    enabled: true,
  })
}

export function useDashboardSettings(
  workspaceId: string | null,
): UseQueryResult<WorkspaceSettings, ApiRequestError> {
  return useQuery<WorkspaceSettings, ApiRequestError>({
    queryKey: ["dashboard-settings", workspaceId],
    queryFn: () =>
      api.get<WorkspaceSettings>(buildWorkspacePath(workspaceId, "/dashboard/settings")),
    enabled: true,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })
}

export function useUpdateDashboardSettings(
  workspaceId: string | null,
): UseMutationResult<WorkspaceSettings, ApiRequestError, WorkspaceSettings> {
  const queryClient = useQueryClient()

  return useMutation<WorkspaceSettings, ApiRequestError, WorkspaceSettings>({
    mutationFn: (body) =>
      api.patch<WorkspaceSettings>(buildWorkspacePath(workspaceId, "/dashboard/settings"), body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["dashboard-settings", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["dashboard-overview", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["workspaces"] })
    },
  })
}

export function useMembers(
  workspaceId: string | null,
): UseQueryResult<MembersResponse, ApiRequestError> {
  return useQuery<MembersResponse, ApiRequestError>({
    queryKey: ["members", workspaceId],
    queryFn: () =>
      api.get<MembersResponse>(
        buildWorkspacePath(requireId(workspaceId, "workspaceId"), "/members"),
      ),
    enabled: workspaceId !== null,
  })
}

export function useUpdateMemberRole(
  workspaceId: string | null,
): UseMutationResult<
  WorkspaceMemberListItem,
  ApiRequestError,
  { memberId: string; role: WorkspaceRole }
> {
  const queryClient = useQueryClient()

  return useMutation<
    WorkspaceMemberListItem,
    ApiRequestError,
    { memberId: string; role: WorkspaceRole }
  >({
    mutationFn: ({ memberId, role }) =>
      api.patch<WorkspaceMemberListItem>(
        buildWorkspacePath(requireId(workspaceId, "workspaceId"), `/members/${memberId}`),
        {
          role,
        },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["members", workspaceId] })
    },
  })
}

export function useRemoveMember(
  workspaceId: string | null,
): UseMutationResult<{ success: true; memberId: string }, ApiRequestError, { memberId: string }> {
  const queryClient = useQueryClient()

  return useMutation<{ success: true; memberId: string }, ApiRequestError, { memberId: string }>({
    mutationFn: ({ memberId }) =>
      api.delete<{ success: true; memberId: string }>(
        buildWorkspacePath(requireId(workspaceId, "workspaceId"), `/members/${memberId}`),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["members", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["dashboard-overview", workspaceId] })
    },
  })
}

export function useTags(
  workspaceId: string | null,
): UseQueryResult<ListTagsResponse, ApiRequestError> {
  return useQuery<ListTagsResponse, ApiRequestError>({
    queryKey: ["tags", workspaceId],
    queryFn: () => api.get<ListTagsResponse>(buildWorkspacePath(workspaceId, "/tags")),
    enabled: true,
  })
}

export function useCreateTag(
  workspaceId: string | null,
): UseMutationResult<Tag, ApiRequestError, { name: string; color: string }> {
  const queryClient = useQueryClient()

  return useMutation<Tag, ApiRequestError, { name: string; color: string }>({
    mutationFn: (body) => api.post<Tag>(buildWorkspacePath(workspaceId, "/tags"), body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tags", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["files", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["search", workspaceId] })
    },
  })
}

export function useUpdateTag(
  workspaceId: string | null,
): UseMutationResult<Tag, ApiRequestError, { tagId: string; name?: string; color?: string }> {
  const queryClient = useQueryClient()

  return useMutation<Tag, ApiRequestError, { tagId: string; name?: string; color?: string }>({
    mutationFn: ({ tagId, ...body }) =>
      api.patch<Tag>(buildWorkspacePath(workspaceId, `/tags/${tagId}`), body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tags", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["files", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["search", workspaceId] })
    },
  })
}

export function useDeleteTag(
  workspaceId: string | null,
): UseMutationResult<{ success: true; tagId: string }, ApiRequestError, { tagId: string }> {
  const queryClient = useQueryClient()

  return useMutation<{ success: true; tagId: string }, ApiRequestError, { tagId: string }>({
    mutationFn: ({ tagId }) =>
      api.delete<{ success: true; tagId: string }>(
        buildWorkspacePath(workspaceId, `/tags/${tagId}`),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tags", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["files", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["search", workspaceId] })
    },
  })
}

interface RenameFileResponse {
  id: string
  originalName: string
  extension: string | null
  updatedAt: string
}

export function useRenameFile(
  workspaceId: string | null,
): UseMutationResult<RenameFileResponse, ApiRequestError, { fileId: string; name: string }> {
  const queryClient = useQueryClient()

  return useMutation<RenameFileResponse, ApiRequestError, { fileId: string; name: string }>({
    mutationFn: ({ fileId, name }) =>
      api.patch<RenameFileResponse>(buildWorkspacePath(workspaceId, `/files/${fileId}`), { name }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["files", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["search", workspaceId] })
    },
  })
}

interface DeleteFileResponse {
  success: true
  fileId: string
}

interface RestoreFileResponse {
  success: true
  fileId: string
  restoredToFolderId: string | null
  restoredName: string
  restoredToRoot: boolean
}

interface RestoreFolderResponse {
  success: true
  folderId: string
  restoredToFolderId: string | null
  restoredName: string
  restoredToRoot: boolean
}

export function useDeleteFile(
  workspaceId: string | null,
): UseMutationResult<DeleteFileResponse, ApiRequestError, { fileId: string }> {
  const queryClient = useQueryClient()

  return useMutation<DeleteFileResponse, ApiRequestError, { fileId: string }>({
    mutationFn: ({ fileId }) =>
      api.delete<DeleteFileResponse>(buildWorkspacePath(workspaceId, `/files/${fileId}`)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["files", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["search", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["dashboard-overview", workspaceId] })
    },
  })
}

export function useRestoreFile(
  workspaceId: string | null,
): UseMutationResult<RestoreFileResponse, ApiRequestError, { fileId: string }> {
  const queryClient = useQueryClient()

  return useMutation<RestoreFileResponse, ApiRequestError, { fileId: string }>({
    mutationFn: ({ fileId }) =>
      api.post<RestoreFileResponse>(buildWorkspacePath(workspaceId, `/files/${fileId}/restore`)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["trash", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["files", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["folders", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["search", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["shares", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["dashboard-overview", workspaceId] })
    },
  })
}

export function useUploadVideoThumbnail(
  workspaceId: string | null,
): UseMutationResult<{ success: boolean }, ApiRequestError, { fileId: string; blob: Blob }> {
  const queryClient = useQueryClient()

  return useMutation<{ success: boolean }, ApiRequestError, { fileId: string; blob: Blob }>({
    mutationFn: ({ fileId, blob }) =>
      api.postBlob<{ success: boolean }>(
        buildWorkspacePath(workspaceId, `/files/${fileId}/thumbnail`),
        blob,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["thumbnail", workspaceId, variables.fileId] })
      void queryClient.invalidateQueries({ queryKey: ["files", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["search", workspaceId] })
    },
  })
}

export function usePermanentlyDeleteFile(
  workspaceId: string | null,
): UseMutationResult<DeleteFileResponse, ApiRequestError, { fileId: string }> {
  const queryClient = useQueryClient()

  return useMutation<DeleteFileResponse, ApiRequestError, { fileId: string }>({
    mutationFn: ({ fileId }) =>
      api.delete<DeleteFileResponse>(buildWorkspacePath(workspaceId, `/files/${fileId}/permanent`)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["trash", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["files", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["folders", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["search", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["shares", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["dashboard-overview", workspaceId] })
    },
  })
}

export function useToggleFavorite(
  workspaceId: string | null,
): UseMutationResult<
  { fileId: string; isFavorited: boolean },
  ApiRequestError,
  { fileId: string }
> {
  const queryClient = useQueryClient()

  return useMutation<{ fileId: string; isFavorited: boolean }, ApiRequestError, { fileId: string }>(
    {
      mutationFn: ({ fileId }) =>
        api.post<{ fileId: string; isFavorited: boolean }>(
          buildWorkspacePath(workspaceId, `/files/${fileId}/favorite`),
        ),
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ["files", workspaceId] })
        void queryClient.invalidateQueries({ queryKey: ["search", workspaceId] })
        void queryClient.invalidateQueries({ queryKey: ["trash", workspaceId] })
      },
    },
  )
}

export function useUpdateFileTags(
  workspaceId: string | null,
): UseMutationResult<FileObject, ApiRequestError, { fileId: string; tagIds: string[] }> {
  const queryClient = useQueryClient()

  return useMutation<FileObject, ApiRequestError, { fileId: string; tagIds: string[] }>({
    mutationFn: ({ fileId, tagIds }) =>
      api.post<FileObject>(buildWorkspacePath(workspaceId, `/files/${fileId}/tags`), { tagIds }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["files", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["search", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["tags", workspaceId] })
    },
  })
}

interface FolderResponse {
  id: string
  workspaceId: string
  parentFolderId: string | null
  name: string
  path: string
  createdBy: string
  isDeleted: boolean
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

interface DeleteFolderResponse {
  success: true
  folderId: string
}

export function useCreateFolder(
  workspaceId: string | null,
): UseMutationResult<
  FolderResponse,
  ApiRequestError,
  { name: string; parentFolderId?: string | null }
> {
  const queryClient = useQueryClient()

  return useMutation<
    FolderResponse,
    ApiRequestError,
    { name: string; parentFolderId?: string | null }
  >({
    mutationFn: ({ name, parentFolderId }) =>
      api.post<FolderResponse>(buildWorkspacePath(workspaceId, "/folders"), {
        name,
        parentFolderId: parentFolderId ?? null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["folders", workspaceId] })
    },
  })
}

export function useUpdateFolder(
  workspaceId: string | null,
): UseMutationResult<
  FolderResponse,
  ApiRequestError,
  { folderId: string; name?: string; parentFolderId?: string | null }
> {
  const queryClient = useQueryClient()

  return useMutation<
    FolderResponse,
    ApiRequestError,
    { folderId: string; name?: string; parentFolderId?: string | null }
  >({
    mutationFn: ({ folderId, name, parentFolderId }) =>
      api.patch<FolderResponse>(buildWorkspacePath(workspaceId, `/folders/${folderId}`), {
        name,
        parentFolderId,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["folders", workspaceId] })
    },
  })
}

export function useDeleteFolder(
  workspaceId: string | null,
): UseMutationResult<DeleteFolderResponse, ApiRequestError, { folderId: string }> {
  const queryClient = useQueryClient()

  return useMutation<DeleteFolderResponse, ApiRequestError, { folderId: string }>({
    mutationFn: ({ folderId }) =>
      api.delete<DeleteFolderResponse>(buildWorkspacePath(workspaceId, `/folders/${folderId}`)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["files", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["folders", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["trash", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["search", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["dashboard-overview", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["dashboard-settings", workspaceId] })
    },
  })
}

export function useRestoreFolder(
  workspaceId: string | null,
): UseMutationResult<RestoreFolderResponse, ApiRequestError, { folderId: string }> {
  const queryClient = useQueryClient()

  return useMutation<RestoreFolderResponse, ApiRequestError, { folderId: string }>({
    mutationFn: ({ folderId }) =>
      api.post<RestoreFolderResponse>(
        buildWorkspacePath(workspaceId, `/folders/${folderId}/restore`),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["trash", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["files", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["folders", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["search", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["shares", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["dashboard-overview", workspaceId] })
    },
  })
}

export function usePermanentlyDeleteFolder(
  workspaceId: string | null,
): UseMutationResult<DeleteFolderResponse, ApiRequestError, { folderId: string }> {
  const queryClient = useQueryClient()

  return useMutation<DeleteFolderResponse, ApiRequestError, { folderId: string }>({
    mutationFn: ({ folderId }) =>
      api.delete<DeleteFolderResponse>(
        buildWorkspacePath(workspaceId, `/folders/${folderId}/permanent`),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["trash", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["files", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["folders", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["search", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["shares", workspaceId] })
    },
  })
}

interface UpdateFileResponse {
  id: string
  originalName: string
  extension: string | null
  folderId: string | null
  updatedAt: string
}

export function useMoveFile(
  workspaceId: string | null,
): UseMutationResult<
  UpdateFileResponse,
  ApiRequestError,
  { fileId: string; folderId: string | null }
> {
  const queryClient = useQueryClient()

  return useMutation<
    UpdateFileResponse,
    ApiRequestError,
    { fileId: string; folderId: string | null }
  >({
    mutationFn: ({ fileId, folderId }) =>
      api.patch<UpdateFileResponse>(buildWorkspacePath(workspaceId, `/files/${fileId}`), {
        folderId,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["files", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["folders", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["search", workspaceId] })
    },
  })
}

interface ListSharesResponse {
  data: ShareDashboardItem[]
  meta: PaginationMeta & {
    scope: SharesListScope
    currentUserRole: WorkspaceRole
    canManageAll: boolean
  }
}

interface CreateShareRequest {
  resourceId: string
  resourceType: "file" | "folder"
  shareType: "internal" | "external_direct" | "external_explorer"
  password?: string
  expiresAt?: string
  permissions?: ("read" | "download")[]
}

interface UpdateShareRequest {
  password?: string | null
  expiresAt?: string | null
  isActive?: boolean
}

export function useShares(
  workspaceId: string | null,
  options?: {
    scope?: SharesListScope
    q?: string
    page?: number
    limit?: number
    enabled?: boolean
  },
): UseQueryResult<ListSharesResponse, ApiRequestError> {
  return useQuery<ListSharesResponse, ApiRequestError>({
    queryKey: ["shares", workspaceId, options],
    queryFn: () => {
      const params = new URLSearchParams()

      if (options?.scope) params.set("scope", options.scope)
      if (options?.q) params.set("q", options.q)
      if (options?.page !== undefined) params.set("page", String(options.page))
      if (options?.limit !== undefined) params.set("limit", String(options.limit))

      const qs = params.toString()
      return api.get<ListSharesResponse>(
        `${buildWorkspacePath(workspaceId, "/shares")}${qs ? `?${qs}` : ""}`,
      )
    },
    enabled: options?.enabled !== false,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })
}

export function useCreateShare(
  workspaceId: string | null,
): UseMutationResult<ShareLink, ApiRequestError, CreateShareRequest> {
  const queryClient = useQueryClient()

  return useMutation<ShareLink, ApiRequestError, CreateShareRequest>({
    mutationFn: (body) => api.post<ShareLink>(buildWorkspacePath(workspaceId, "/shares"), body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["shares", workspaceId] })
    },
  })
}

export function useUpdateShare(
  workspaceId: string | null,
): UseMutationResult<ShareLink, ApiRequestError, UpdateShareRequest & { shareId: string }> {
  const queryClient = useQueryClient()

  return useMutation<ShareLink, ApiRequestError, UpdateShareRequest & { shareId: string }>({
    mutationFn: ({ shareId, ...body }) =>
      api.patch<ShareLink>(buildWorkspacePath(workspaceId, `/shares/${shareId}`), body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["shares", workspaceId] })
    },
  })
}

export function useDeleteShare(
  workspaceId: string | null,
): UseMutationResult<{ success: boolean; shareId: string }, ApiRequestError, { shareId: string }> {
  const queryClient = useQueryClient()

  return useMutation<{ success: boolean; shareId: string }, ApiRequestError, { shareId: string }>({
    mutationFn: ({ shareId }) =>
      api.delete<{ success: boolean; shareId: string }>(
        buildWorkspacePath(workspaceId, `/shares/${shareId}`),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["shares", workspaceId] })
    },
  })
}

interface ShareInfoData {
  id: string
  resourceType: "file" | "folder"
  resourceName: string
  shareType: "internal" | "external_direct" | "external_explorer"
  hasPassword: boolean
  isActive: boolean
  expiresAt: string | null
  createdAt: string
  brandingLogoUrl: string | null
  brandingName: string | null
}

interface ShareAccessResult {
  resourceType: "file" | "folder"
  resourceName: string
  signedUrl?: string
  publicUrl?: string
  files?: Array<{ id: string; name: string; mimeType: string; sizeBytes: number }>
  folders?: Array<{ id: string; name: string }>
  brandingLogoUrl: string | null
  brandingName: string | null
}

interface ShareBrowseResult {
  resourceName: string
  currentFolderId: string | null
  breadcrumbs: Array<{ id: string | null; name: string }>
  files: Array<{ id: string; name: string; mimeType: string; sizeBytes: number }>
  folders: Array<{ id: string; name: string }>
  brandingLogoUrl: string | null
  brandingName: string | null
}

export function useShareInfo(
  shareId: string | null,
): UseQueryResult<ShareInfoData, ApiRequestError> {
  return useQuery<ShareInfoData, ApiRequestError>({
    queryKey: ["shareInfo", shareId],
    queryFn: () => api.get<ShareInfoData>(`/api/shares/${requireId(shareId, "shareId")}`),
    enabled: shareId !== null,
    retry: (failureCount, error) => {
      if (error.status === 404 || error.status === 410 || error.status === 423) {
        return false
      }

      return failureCount < 3
    },
  })
}

export function useAccessShare(
  shareId: string | null,
): UseMutationResult<ShareAccessResult, ApiRequestError, { password?: string }> {
  const queryClient = useQueryClient()

  return useMutation<ShareAccessResult, ApiRequestError, { password?: string }>({
    mutationFn: (body) =>
      api.post<ShareAccessResult>(`/api/shares/${requireId(shareId, "shareId")}/access`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["shareInfo", shareId] })
    },
  })
}

export function useBrowseShare(
  shareId: string | null,
): UseMutationResult<ShareBrowseResult, ApiRequestError, { folderId?: string; password?: string }> {
  const queryClient = useQueryClient()

  return useMutation<ShareBrowseResult, ApiRequestError, { folderId?: string; password?: string }>({
    mutationFn: (body) =>
      api.post<ShareBrowseResult>(`/api/shares/${requireId(shareId, "shareId")}/browse`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["shareBrowse", shareId] })
    },
  })
}

interface ListInvitationsResponse {
  data: InvitationListItem[]
  meta: PaginationMeta
}

export function useInvitations(
  workspaceId: string | null,
): UseQueryResult<ListInvitationsResponse, ApiRequestError> {
  return useQuery<ListInvitationsResponse, ApiRequestError>({
    queryKey: ["invitations", workspaceId],
    queryFn: () =>
      api.get<ListInvitationsResponse>(
        buildWorkspacePath(requireId(workspaceId, "workspaceId"), "/invitations"),
      ),
    enabled: workspaceId !== null,
  })
}

interface CreateInvitationResponse {
  id: string
  email: string
  role: WorkspaceRole
  invitedByName: string
  status: string
  expiresAt: string
  createdAt: string
  inviteLink: string
}

export function useAddMember(
  workspaceId: string | null,
): UseMutationResult<
  CreateInvitationResponse,
  ApiRequestError,
  { email: string; role: Exclude<WorkspaceRole, "owner"> }
> {
  const queryClient = useQueryClient()

  return useMutation<
    CreateInvitationResponse,
    ApiRequestError,
    { email: string; role: Exclude<WorkspaceRole, "owner"> }
  >({
    mutationFn: (body) =>
      api.post<CreateInvitationResponse>(
        buildWorkspacePath(requireId(workspaceId, "workspaceId"), "/members"),
        body,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["members", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["invitations", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["dashboard-overview", workspaceId] })
    },
  })
}

export function useRevokeInvitation(
  workspaceId: string | null,
): UseMutationResult<
  { success: true; invitationId: string },
  ApiRequestError,
  { invitationId: string }
> {
  const queryClient = useQueryClient()

  return useMutation<
    { success: true; invitationId: string },
    ApiRequestError,
    { invitationId: string }
  >({
    mutationFn: ({ invitationId }) =>
      api.delete<{ success: true; invitationId: string }>(
        buildWorkspacePath(requireId(workspaceId, "workspaceId"), `/invitations/${invitationId}`),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["invitations", workspaceId] })
    },
  })
}

export function useInvitationByToken(token: string | null): UseQueryResult<
  {
    id: string
    email: string
    role: WorkspaceRole
    invitedByName: string
    status: string
    expiresAt: string
    createdAt: string
  },
  ApiRequestError
> {
  return useQuery({
    queryKey: ["invitation", token],
    queryFn: () =>
      api.get<{
        id: string
        email: string
        role: WorkspaceRole
        invitedByName: string
        status: string
        expiresAt: string
        createdAt: string
      }>(`/api/invitations/${requireId(token, "token")}`),
    enabled: token !== null,
  })
}

export function useAcceptInvitation(): UseMutationResult<
  { success: true; role: WorkspaceRole },
  ApiRequestError,
  { token: string }
> {
  return useMutation<{ success: true; role: WorkspaceRole }, ApiRequestError, { token: string }>({
    mutationFn: ({ token }) =>
      api.post<{ success: true; role: WorkspaceRole }>(`/api/invitations/${token}/accept`),
  })
}

export function useTransferOwnership(
  workspaceId: string | null,
): UseMutationResult<
  { success: true; workspaceId: string; previousOwnerId: string; newOwnerId: string },
  ApiRequestError,
  { newOwnerId: string }
> {
  const queryClient = useQueryClient()

  return useMutation<
    { success: true; workspaceId: string; previousOwnerId: string; newOwnerId: string },
    ApiRequestError,
    { newOwnerId: string }
  >({
    mutationFn: ({ newOwnerId }) =>
      api.post<{ success: true; workspaceId: string; previousOwnerId: string; newOwnerId: string }>(
        buildWorkspacePath(workspaceId, "/transfer-ownership"),
        { newOwnerId },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["members", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["workspaces"] })
    },
  })
}

export function useNotifications(
  page = 1,
  limit = 50,
): UseQueryResult<
  {
    data: Array<{
      id: string
      userId: string
      workspaceId: string | null
      type: string
      title: string
      message: string
      data?: string | null
      isRead: boolean
      createdAt: string
    }>
    meta: PaginationMeta
  },
  ApiRequestError
> {
  return useQuery<
    {
      data: Array<{
        id: string
        userId: string
        workspaceId: string | null
        type: string
        title: string
        message: string
        data?: string | null
        isRead: boolean
        createdAt: string
      }>
      meta: PaginationMeta
    },
    ApiRequestError
  >({
    queryKey: ["notifications", page, limit],
    queryFn: () => {
      const params = new URLSearchParams()
      params.set("page", String(page))
      params.set("limit", String(limit))
      return api.get<{
        data: Array<{
          id: string
          userId: string
          workspaceId: string | null
          type: string
          title: string
          message: string
          data?: string | null
          isRead: boolean
          createdAt: string
        }>
        meta: PaginationMeta
      }>(`/api/notifications?${params.toString()}`)
    },
    refetchInterval: 30_000,
  })
}

export function useUnreadCount(): UseQueryResult<{ count: number }, ApiRequestError> {
  return useQuery<{ count: number }, ApiRequestError>({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => api.get<{ count: number }>("/api/notifications/unread-count"),
    refetchInterval: 30_000,
  })
}

export function useMarkRead(): UseMutationResult<
  { success: true; id: string },
  ApiRequestError,
  { id: string }
> {
  const queryClient = useQueryClient()

  return useMutation<{ success: true; id: string }, ApiRequestError, { id: string }>({
    mutationFn: ({ id }) =>
      api.patch<{ success: true; id: string }>(`/api/notifications/${id}/read`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] })
      void queryClient.invalidateQueries({ queryKey: ["notifications", "unread-count"] })
    },
  })
}

export function useMarkAllRead(): UseMutationResult<
  { success: true; count: number },
  ApiRequestError,
  void
> {
  const queryClient = useQueryClient()

  return useMutation<{ success: true; count: number }, ApiRequestError>({
    mutationFn: () => api.post<{ success: true; count: number }>("/api/notifications/read-all"),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] })
      void queryClient.invalidateQueries({ queryKey: ["notifications", "unread-count"] })
    },
  })
}

// Platform hooks

export interface PlatformSettingsData {
  platformName: string
  enablePublicSignup: boolean
  platformLogoUrl: string | null
  faviconUrl: string | null
}

export function usePlatformMe(): UseQueryResult<
  {
    id: string
    email: string
    name: string
    isPlatformAdmin: boolean
    role: WorkspaceRole
  },
  ApiRequestError
> {
  return useQuery<
    {
      id: string
      email: string
      name: string
      isPlatformAdmin: boolean
      role: WorkspaceRole
    },
    ApiRequestError
  >({
    queryKey: ["platform-me"],
    queryFn: () =>
      api.get<{
        id: string
        email: string
        name: string
        isPlatformAdmin: boolean
        role: WorkspaceRole
      }>("/api/platform/me"),
  })
}

export function usePlatformSettings(): UseQueryResult<PlatformSettingsData, ApiRequestError> {
  return useQuery<PlatformSettingsData, ApiRequestError>({
    queryKey: ["platform-settings"],
    queryFn: () => api.get<PlatformSettingsData>("/api/platform/settings"),
  })
}

export function useUpdatePlatformSettings(): UseMutationResult<
  { success: true; settings: PlatformSettingsData },
  ApiRequestError,
  Partial<PlatformSettingsData>
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body) =>
      api.patch<{ success: true; settings: PlatformSettingsData }>("/api/platform/settings", body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform-settings"] })
    },
  })
}

export function useUploadPlatformAsset(): UseMutationResult<
  { success: true; settings: PlatformSettingsData },
  ApiRequestError,
  { kind: "logo" | "favicon"; file: File }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ kind, file }) => {
      const form = new FormData()
      form.set("file", file)
      return api.postForm<{ success: true; settings: PlatformSettingsData }>(
        `/api/platform/assets/${kind}`,
        form,
      )
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform-settings"] })
    },
  })
}

export function useUploadBucketBrandingLogo(
  workspaceId: string | null,
): UseMutationResult<WorkspaceSettings, ApiRequestError, { file: File }> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ file }) => {
      const form = new FormData()
      form.set("file", file)
      return api.postForm<WorkspaceSettings>(
        buildWorkspacePath(workspaceId, "/dashboard/settings/assets/logo"),
        form,
      )
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["dashboard-settings", workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ["platform-settings"] })
    },
  })
}

export function useJoinPlatform(): UseMutationResult<
  { success: true; role: string },
  ApiRequestError,
  void
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<{ success: true; role: string }>("/api/platform/join"),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspaces"] })
    },
  })
}

export function useCreateWorkspace(): UseMutationResult<
  {
    id: string
    name: string
    slug: string
    ownerId: string
    storageQuotaBytes: number
    createdAt: string
    updatedAt: string
  },
  ApiRequestError,
  { name: string; slug?: string }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body) =>
      api.post<{
        id: string
        name: string
        slug: string
        ownerId: string
        storageQuotaBytes: number
        createdAt: string
        updatedAt: string
      }>("/api/workspaces", body),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["workspaces"] })
      void queryClient.invalidateQueries({ queryKey: ["dashboard-overview", data.id] })
      void queryClient.invalidateQueries({ queryKey: ["files", data.id] })
      void queryClient.invalidateQueries({ queryKey: ["folders", data.id] })
    },
  })
}

interface PlatformInvitationData {
  id: string
  email: string
  role: string
  status: string
  expiresAt: string
  createdAt: string
  inviteLink?: string
}

export function usePlatformInvitations(): UseQueryResult<
  { data: PlatformInvitationData[] },
  ApiRequestError
> {
  return useQuery<{ data: PlatformInvitationData[] }, ApiRequestError>({
    queryKey: ["platform-invitations"],
    queryFn: () => api.get<{ data: PlatformInvitationData[] }>("/api/platform/invitations"),
  })
}

export function useCreatePlatformInvitation(): UseMutationResult<
  PlatformInvitationData & { inviteLink: string },
  ApiRequestError,
  { email: string; role: string }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body) =>
      api.post<PlatformInvitationData & { inviteLink: string }>("/api/platform/invitations", body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform-invitations"] })
    },
  })
}

export function useAcceptPlatformInvitation(): UseMutationResult<
  { success: true; role: string },
  ApiRequestError,
  string
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (token) =>
      api.post<{ success: true; role: string }>(`/api/platform/invitations/${token}/accept`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspaces"] })
    },
  })
}

export type {
  FileObject,
  Folder,
  BreadcrumbItem,
  CompleteUploadRequest as CompleteUploadPayload,
  CreateShareRequest,
  DownloadUrlResponse,
  InitiateUploadRequest,
  InitiateUploadResponse,
  ListFilesResponse,
  ListFoldersResponse,
  ListTrashResponse,
  ListSharesResponse,
  ShareAccessResult,
  ShareBrowseResult,
  ShareInfoData,
  ShareLink,
  TrashItem,
  WorkspaceData,
}
