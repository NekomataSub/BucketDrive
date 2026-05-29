# Upload System

# Purpose

This document defines the file upload architecture for the platform.

Upload is the most critical user action. It must be:
- Reliable (handles network failures, large files)
- Secure (validated server-side, RBAC-enforced)
- Transparent (progress visible, cancellable, retryable)
- Fast (direct-to-storage uploads via signed URLs)
- Scalable (multipart for large files, resumable)

---

# Core Principles

## 1. Validation Happens Server-Side First

Before any bytes are transferred to storage, the backend validates:
- User has `files.upload` permission in the workspace
- File size does not exceed workspace quota
- MIME type is not in the blocklist
- File extension matches declared MIME type
- File name is safe (no path traversal, no null bytes)

**Never trust frontend validation alone.**

## 2. Direct Upload to Storage

The frontend uploads directly to R2 using a temporary signed URL.
This eliminates bandwidth through the Worker and reduces latency.

## 3. Multipart for Large Files

Files larger than 5 MB are uploaded in 5 MB chunks.
Each chunk gets an individual signed URL and ETag.
The backend tracks upload progress via `UploadSession` and `UploadPart`.

---

# Upload Flow

## Small File (< 5 MB) — Single Part

```txt
User selects file
    ↓
POST /api/workspaces/:id/files/upload
  → Backend validates (RBAC, quota, mime)
  → Backend generates signed upload URL (PUT, expires in 15 min)
  → Backend creates storage key: workspace/{wid}/files/{uploadId}/{fileName}
  ← Returns { uploadId, signedUrl, storageKey }
    ↓
Frontend PUTs file content directly to signedUrl
    ↓
POST /api/workspaces/:id/files/upload/complete
  → Backend records metadata in FileObject table
  → Backend generates audit log
  ← Returns FileObject
    ↓
File appears in explorer (optimistic or after confirmation)
```

## Large File (> 5 MB) — Multipart

```txt
User selects large file
    ↓
POST /api/workspaces/:id/files/upload
  → Backend validates
  → Backend initiates multipart upload in R2
  → Backend creates UploadSession in DB
  ← Returns { uploadId, sessionId, partSize: 5MB, totalParts: N }
    ↓
For each part (1 to N):
  Frontend reads chunk from file (File.slice)
  Frontend uploads chunk to signed URL
  Frontend records ETag from R2 response
    ↓
POST /api/workspaces/:id/files/upload/complete
  body: { uploadId, parts: [{ partNumber, etag, sizeBytes }] }
  → Backend completes multipart upload in R2
  → Backend records metadata in FileObject
  → Backend records audit log
  ← Returns FileObject
```

---

# Validation Rules

## Server-Side Validation

```ts
// apps/api/src/services/upload.service.ts

const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024  // 5 GB per file
const BLOCKED_EXTENSIONS = [".exe", ".bat", ".sh", ".msi", ".app", ".dmg"]
const BLOCKED_MIME_PREFIXES = [
  "application/x-msdownload",
  "application/x-ms-installer",
  "application/x-executable",
]

function validateUpload(params: UploadParams, workspaceQuota: number, usedBytes: number) {
  // Size check
  if (params.sizeBytes > MAX_FILE_SIZE) {
    throw new UploadError("FILE_TOO_LARGE", `Max file size is ${MAX_FILE_SIZE / 1e9} GB`)
  }

  // Quota check
  if (usedBytes + params.sizeBytes > workspaceQuota) {
    throw new UploadError("QUOTA_EXCEEDED", "Workspace storage quota exceeded")
  }

  // Extension blocklist
  const ext = path.extname(params.fileName).toLowerCase()
  if (BLOCKED_EXTENSIONS.includes(ext)) {
    throw new UploadError("BLOCKED_EXTENSION", `File type ${ext} is not allowed`)
  }

  // MIME blocklist
  const blocked = BLOCKED_MIME_PREFIXES.some(p => params.mimeType.startsWith(p))
  if (blocked) {
    throw new UploadError("BLOCKED_MIME", `MIME type ${params.mimeType} is not allowed`)
  }

  // Name safety
  if (params.fileName.includes("\0") || params.fileName.includes("..")) {
    throw new UploadError("INVALID_NAME", "File name contains invalid characters")
  }
}
```

---

# Multipart Upload Details

## Part Size

- Default part size: 5 MB
- Minimum part size: 5 MB (R2 requirement)
- Maximum parts: 10,000 (R2 limit)
- Theoretical max file: 50 TB (10,000 × 5 MB)

## Upload Session

Tracked in `UploadSession` table:

```txt
id, workspaceId, userId, bucketId, status, uploadType,
totalSize, uploadedSize, storageKey, partsCompleted,
createdAt, updatedAt
```

Status values: `initiated`, `in_progress`, `completed`, `failed`, `cancelled`

## Upload Part

Tracked in `UploadPart` table:

```txt
id, uploadSessionId, partNumber, etag, sizeBytes, uploadedAt
```

## Resumability

If the user's connection drops:
1. The `UploadSession` persists in DB
2. The frontend queries `GET /api/uploads/:sessionId` to get the session state
3. Returns: which parts are already completed (with ETags), which parts remain
4. Frontend resumes from the next incomplete part
5. Upload sessions auto-expire after 24 hours (cleanup job removes partial R2 data)

---

# Error Handling & Retry

## Client-Side Retry

```ts
// apps/web/src/hooks/use-upload.ts
const MAX_RETRIES = 3
const RETRY_BASE_DELAY = 1000  // 1 second

async function uploadWithRetry(chunk: Blob, signedUrl: string, retries = 0): Promise<string> {
  try {
    const res = await fetch(signedUrl, {
      method: "PUT",
      body: chunk,
    })
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
    return res.headers.get("ETag")!
  } catch (err) {
    if (retries < MAX_RETRIES) {
      const delay = RETRY_BASE_DELAY * Math.pow(2, retries)
      await new Promise(r => setTimeout(r, delay))
      return uploadWithRetry(chunk, signedUrl, retries + 1)
    }
    throw err
  }
}
```

## Server-Side Errors

| Error Code | Cause | Action |
|---|---|---|
| `FILE_TOO_LARGE` | File > 5 GB | Frontend shows max size in error message |
| `QUOTA_EXCEEDED` | Workspace over quota | Show quota usage + upgrade CTA |
| `BLOCKED_EXTENSION` | .exe, .bat, etc. | Show blocked extension list |
| `BLOCKED_MIME` | Executable MIME | Show allowed MIME categories |
| `INVALID_NAME` | Path traversal attempt | Log as security event, show generic error |
| `UPLOAD_SESSION_EXPIRED` | Session > 24h old | Restart upload from beginning |

---

# UI Behavior

## Upload Queue

- Persistent sidebar/drawer: always visible during uploads
- Shows: filename, progress bar (%), speed (MB/s), ETA
- Batch list: all files in queue with individual statuses
- Actions per file: pause, resume, cancel
- Minimizable to a compact floating widget

## File Addition Methods

- **Click**: "Upload" button → native file picker
- **Drag from OS**: drag files/folders from Finder/Explorer into explorer
- **Paste**: Ctrl+V on the explorer pastes copied files/images from clipboard
- **Folder upload**: preserves directory structure (see interactions.md)

## Progress Reporting

- Single-part upload: browser `fetch` with `ReadableStream` tracks bytes sent
- Multipart upload: progress = completed parts / total parts
- Speed calculation: bytes uploaded in last 2 seconds, rolling average
- ETA: remaining bytes / average speed

## Empty State / Success

- Upload complete → file appears in explorer (optimistic or after API confirm)
- Toast notification: "3 files uploaded to Projects/Design/"
- Failed upload → red indicator in queue, retry button enabled
- All uploads complete → queue auto-hides after 5 seconds

---

# Cancellation

```ts
// Client
async function cancelUpload(sessionId: string) {
  await fetch(`/api/uploads/${sessionId}`, { method: "DELETE" })
  // Backend aborts multipart upload in R2, marks session as cancelled
  // Orphaned parts are cleaned by R2 automatically
}
```

---

# Security Considerations

- Signed URLs expire in 15 minutes (configurable)
- Signed URLs are operation-scoped (PUT only for upload, GET only for download)
- Upload endpoint is rate-limited: max 20 upload initiations per minute per user
- File contents are NOT inspected by the Worker (pass-through via signed URL)
- Future: antivirus scanning as async worker job after upload completes

---

# Performance

- Uploads bypass the Worker entirely (direct browser → R2) — no Worker bandwidth cost
- Multipart enables parallel upload of chunks (configurable concurrency, default 3)
- Upload queue in UI is virtualized if > 20 items

---

# Storage Key Format

```txt
workspace/{workspaceId}/files/{uploadId}/{fileName}
```

Example:
```txt
workspace/ws_abc123/files/550e8400-e29b-41d4-a716-446655440000/AGENTS.md
```

- UUID upload folder prevents collisions while preserving the original file name and extension
- Workspace prefix enables bucket lifecycle policies (future)
- Original file name stored in `FileObject.originalName` and preserved in the object key suffix

---

# References

- [Storage Provider Architecture](../storage/storage-provider.md)
- [API Contracts — Files Upload](../architecture/api-contracts.md#files)
- [Frontend Interactions — Upload](../frontend/interactions.md#upload-interactions)
- [Data Model — UploadSession / UploadPart](../database/data-model.md#upload-session)
