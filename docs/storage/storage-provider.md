# Storage Provider Architecture

# Purpose

This document defines the storage architecture of the platform.

The system must support:
- Cloudflare R2
- S3-compatible providers
- future provider expansion

Storage must remain:
- provider-agnostic
- secure
- scalable
- auditable
- isolated from frontend concerns

The application must NEVER tightly couple business logic to a specific storage provider.

---

# Core Principles

## 1. Storage Abstraction

All storage operations must go through a shared abstraction layer.

The application must NEVER:
- directly depend on R2 APIs
- directly depend on S3 SDK behavior
- hardcode provider-specific logic

Required:

```ts
interface StorageProvider {
  upload()
  delete()
  move()
  copy()
  list()
  getSignedUploadUrl()
  getSignedDownloadUrl()
}
```

---

## 2. Provider Isolation

Storage providers must remain isolated from:
- business rules
- RBAC logic
- frontend logic

The storage layer only handles:
- object operations
- object metadata
- provider communication

---

## 3. Backend Ownership

The frontend must NEVER:
- directly manage storage permissions
- construct storage URLs
- access unrestricted buckets

All storage access must be brokered by backend services.

---

# Supported Providers

The architecture must support:

- Cloudflare R2
- Amazon S3
- MinIO
- Backblaze B2
- Wasabi

Providers should remain interchangeable whenever possible.

---

# Storage Architecture

```txt
Frontend
    ↓
API
    ↓
Storage Service
    ↓
StorageProvider Interface
    ↓
Provider Implementation
    ↓
R2 / S3 / MinIO
```

---

# Object Model

Stored files are represented as:

## FileObject

The database stores:
- metadata
- ownership
- path
- mime type
- size
- checksums
- tags

The database does NOT store:
- binary file contents

---

# Object Key Strategy

Object keys must be:
- deterministic
- collision-safe
- workspace-scoped

Avoid:
- user-generated raw paths
- unsafe filenames
- predictable public paths

Recommended format:

```txt
workspace/{workspaceId}/files/{uploadId}/{fileName}
```

Explorer listings run an automatic R2 sync before serving stale catalog data. The sync imports new objects, updates R2-owned metadata such as size/content type, and moves active database rows to trash when their object is no longer present in R2.

---

# Upload Architecture

Uploads must use:
- signed upload URLs
- direct-to-storage uploads
- backend authorization

The backend validates:
- permissions
- quotas
- file constraints

The frontend uploads directly to storage using temporary credentials.

---

# Upload Flow

```txt
User
    ↓
Frontend
    ↓
API Validation
    ↓
RBAC Validation
    ↓
Quota Validation
    ↓
Signed Upload URL
    ↓
Direct Upload to Storage
    ↓
Metadata Registration
    ↓
Audit Log
```

---

# Multipart Uploads

Large files must support multipart uploads.

Required:
- resumability
- chunk validation
- upload recovery

Multipart uploads should:
- remain provider-agnostic
- support cancellation
- support retry logic

---

# Upload Validation

All uploads must validate:
- mime type
- file size
- quota limits
- workspace restrictions

Avoid trusting:
- frontend mime types
- frontend file extensions

---

# Download Architecture

Downloads must use:
- temporary signed URLs
- backend authorization
- expiring access

The backend validates:
- permissions
- share access
- ownership rules

---

# Download Flow

```txt
User
    ↓
Frontend
    ↓
Authorization Check
    ↓
Signed Download URL
    ↓
Temporary Storage Access
```

---

# Signed URL Rules

Signed URLs:
- must expire
- must remain short-lived
- must be scoped to one operation

Avoid:
- permanent public URLs
- unrestricted bucket access

Signed URLs are temporary capabilities,
NOT authorization systems.

---

# Public Sharing

Public sharing must NEVER expose:
- raw bucket structure
- unrestricted object access
- provider credentials

Public sharing must go through:
- share validation
- expiration validation
- optional password validation

---

# Metadata Handling

Metadata should remain separate from storage providers.

Database metadata includes:
- owner
- mime type
- file size
- tags
- timestamps
- checksum
- share state

Storage providers should only store:
- object data
- provider-level metadata when required

---

# Folder Architecture

Folders are virtual.

Folders are represented through:
- object paths
- metadata structures

Avoid provider-specific folder assumptions.

---

# File Moving

Moving files should:
- preserve metadata
- preserve permissions
- remain atomic when possible

Avoid:
- partial move failures
- inconsistent paths

---

# File Copying

Copy operations must:
- preserve integrity
- optionally inherit metadata
- remain auditable

---

# File Deletion

Deletion must support:
- soft delete
- trash recovery
- permanent purge

Deletion events must generate audit logs.

---

# Trash System

Deleted files should move to:
- logical trash state
- recoverable storage state

Trash retention should support:
- expiration policies
- automatic cleanup

---

# Versioning

The architecture must support future:
- object versioning
- rollback
- file history

The storage layer must not prevent future version support.

---

# Quota Management

Storage quotas must support:
- per-user limits
- per-workspace limits
- storage analytics

Quota calculations should include:
- active files
- trash retention
- versioned files in future

---

# Storage Analytics

The platform should support:
- largest files
- storage usage
- growth trends
- bandwidth estimation

Analytics should remain provider-independent.

---

# Security Rules

Storage systems must:
- isolate workspaces
- prevent unauthorized access
- prevent bucket traversal
- validate signed operations

Never expose:
- provider secrets
- unrestricted credentials
- internal bucket names publicly

---

# Antivirus & Scanning

Future support should include:
- virus scanning
- malware detection
- suspicious file analysis

Scanning should occur asynchronously through workers.

---

# File Processing

Workers may process:
- thumbnails
- previews
- OCR
- indexing
- metadata extraction

Heavy processing must remain asynchronous.

---

# CDN Integration

Storage delivery should support:
- CDN caching
- edge delivery
- optimized downloads

Cache invalidation must remain controlled.

---

# Error Handling

Storage operations must:
- return typed errors
- support retry handling
- preserve consistency

Avoid:
- silent failures
- partial metadata writes

---

# Audit Logging

Critical storage operations must generate logs:
- uploads
- deletions
- restores
- downloads
- share access
- failed operations

---

# Forbidden Practices

Never:
- expose raw bucket credentials
- trust frontend upload metadata
- hardcode provider logic
- expose permanent signed URLs
- bypass storage abstraction
- tightly couple metadata to provider APIs

---

# Recommended Services

Recommended architecture:

```txt
StorageService
    ↓
StorageProvider
    ↓
Provider Adapter
```

---

# Recommended Utilities

Preferred APIs:

```ts
storage.upload()

storage.delete()

storage.move()

storage.generateSignedDownloadUrl()
```

Avoid:
- scattered provider SDK calls
- duplicated upload logic

---

# Future Scalability

The storage architecture must support future:
- multi-region replication
- lifecycle policies
- cold storage tiers
- archive systems
- intelligent caching
- deduplication
- file versioning
- realtime sync

The architecture must remain extensible and provider-agnostic.
