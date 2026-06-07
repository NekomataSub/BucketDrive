import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "node:test"

const root = new URL("..", import.meta.url)

async function read(relativePath) {
  return readFile(new URL(relativePath, root), "utf8")
}

test("platform admin route is mounted in the SPA and calls the platform API", async () => {
  const [routes, api, sidebar] = await Promise.all([
    read("src/routes/__root__.tsx"),
    read("src/lib/api.ts"),
    read("src/components/layout/sidebar.tsx"),
  ])

  assert.match(routes, /path:\s*"\/dashboard\/platform"/)
  assert.match(routes, /component:\s*withSuspense\(PlatformAdminPage\)/)
  assert.match(api, /"\/api\/platform\/settings"/)
  assert.match(api, /"\/api\/platform\/invitations"/)
  assert.match(sidebar, /isPlatformAdmin/)
})

test("onboarding route is mounted and the app redirects workspace-less users there", async () => {
  const [routes, onboarding, api] = await Promise.all([
    read("src/routes/__root__.tsx"),
    read("src/routes/onboarding.tsx"),
    read("src/lib/api.ts"),
  ])

  assert.match(routes, /path:\s*"\/onboarding"/)
  assert.match(routes, /throw redirect\(\{\s*to:\s*"\/onboarding"\s*\}\)/)
  assert.match(onboarding, /Join default workspace/)
  assert.match(onboarding, /usePlatformMe/)
  assert.match(api, /"\/api\/storage\/status"/)
  assert.match(api, /bucketName/)
})

test("R2 sync runs automatically while preserving the admin import endpoint", async () => {
  const [apiHandler, webApi, filesRoute, worker] = await Promise.all([
    read("../../apps/api/src/modules/files/files.handler.ts"),
    read("src/lib/api.ts"),
    read("src/routes/app/files.tsx"),
    read("../../apps/workers/src/index.ts"),
  ])

  assert.match(apiHandler, /"\/import-r2"/)
  assert.match(apiHandler, /workspace\.settings\.update/)
  assert.match(apiHandler, /syncR2WorkspaceIfStale/)
  assert.match(webApi, /useImportR2/)
  assert.doesNotMatch(filesRoute, /Sync R2/)
  assert.match(worker, /syncAllR2Workspaces/)
})

test("sidebar uses exact active matching and avoids duplicate dashboard tabs", async () => {
  const sidebar = await read("src/components/layout/sidebar.tsx")

  assert.match(sidebar, /activeOptions=\{\{\s*exact:\s*true\s*\}\}/)
  assert.doesNotMatch(sidebar, /label:\s*"Storage"/)
})

test("file explorer separates drag handles from open and preview actions", async () => {
  const [grid, list, filesRoute, shortcuts] = await Promise.all([
    read("src/components/features/file-grid.tsx"),
    read("src/components/features/file-list.tsx"),
    read("src/routes/app/files.tsx"),
    read("src/hooks/use-explorer-shortcuts.ts"),
  ])

  assert.match(grid, /aria-label="Drag file"/)
  assert.match(list, /aria-label="Drag file"/)
  assert.match(filesRoute, /activationConstraint:\s*\{\s*distance:\s*8/)
  assert.match(filesRoute, /setPreviewFileId\(file\.id\)/)
  assert.match(shortcuts, /itemToOpen\?\.type === "file" && onPreviewItem/)
})

test("upload menu supports file and folder picker while keeping drag upload", async () => {
  const [dropZone, filesRoute] = await Promise.all([
    read("src/components/features/upload-drop-zone.tsx"),
    read("src/routes/app/files.tsx"),
  ])

  assert.match(dropZone, /onClickUpload\?: \(\) => void/)
  assert.match(dropZone, /<button/)
  assert.match(dropZone, /onClick=\{onClickUpload\}/)
  assert.match(dropZone, /onDrop=\{handleDrop\}/)
  assert.match(dropZone, /Click or drag files or folders here to upload/)
  assert.match(filesRoute, /fileInputRef\.current\?\.click\(\)/)
  assert.match(filesRoute, /folderInputRef\.current\?\.click\(\)/)
  assert.match(filesRoute, /DropdownMenu\.Root/)
  assert.match(filesRoute, />\s*Files\s*</)
  assert.match(filesRoute, />\s*Folder\s*</)
  assert.match(filesRoute, /webkitdirectory/)
  assert.match(filesRoute, /file\.webkitRelativePath \|\| file\.name/)
  assert.match(filesRoute, /status:\s*"preparing" as const/)
  assert.match(filesRoute, /status:\s*"queued"/)
  assert.match(filesRoute, /onClickUpload=\{handleFileSelect\}/)
})

test("R2 local CORS configuration is versioned and wired to a package script", async () => {
  const [rootPackage, corsScript, cors] = await Promise.all([
    read("../../package.json"),
    read("../../scripts/apply-r2-cors.ts"),
    read("../../docs/storage/r2-cors.dev.json"),
  ])

  assert.match(rootPackage, /"r2:cors:dev"/)
  assert.match(corsScript, /"wrangler"/)
  assert.match(corsScript, /"r2"/)
  assert.match(corsScript, /"bucket"/)
  assert.match(corsScript, /"cors"/)
  assert.match(corsScript, /"set"/)
  assert.match(cors, /"http:\/\/localhost:5173"/)
  assert.match(cors, /"http:\/\/localhost:5174"/)
  assert.match(cors, /"PUT"/)
  assert.match(cors, /"ETag"/)
})

test("public share browse sends password in a POST body instead of query string", async () => {
  const [api, shareRoute] = await Promise.all([
    read("src/lib/api.ts"),
    read("src/routes/share.$shareId.tsx"),
  ])

  assert.match(api, /api\.post<ShareBrowseResult>/)
  assert.doesNotMatch(api, /new URLSearchParams\(\{\s*password/)
  assert.doesNotMatch(api, /\/browse\?\$\{params\.toString\(\)\}/)
  assert.match(shareRoute, /password:\s*browsePassword\s*\|\|\s*undefined/)
})

test("markdown preview does not inject generated HTML", async () => {
  const preview = await read("src/components/features/file-preview.tsx")

  assert.doesNotMatch(preview, /dangerouslySetInnerHTML/)
  assert.match(preview, /content\.split\("\\n"\)\.map/)
})

test("visual thumbnails poll for pending generated thumbnails", async () => {
  const [thumbnail, api, videoThumbnail] = await Promise.all([
    read("src/components/features/file-thumbnail.tsx"),
    read("src/lib/api.ts"),
    read("src/lib/video-thumbnail.ts"),
  ])

  assert.match(thumbnail, /BROWSER_THUMBNAIL_VIDEO_TYPES/)
  assert.match(
    thumbnail,
    /const shouldFetchThumbnail = isImage \|\| \(isVideo && Boolean\(thumbnailKey\)\)/,
  )
  assert.match(thumbnail, /canGenerateBrowserVideoThumbnail/)
  assert.match(thumbnail, /usePreviewUrl/)
  assert.match(thumbnail, /extractVideoFrameFromUrl/)
  assert.match(thumbnail, /imageFailed/)
  assert.match(thumbnail, /setImageFailed\(true\)/)
  assert.doesNotMatch(thumbnail, /style\.display = "none"/)
  assert.match(api, /THUMBNAIL_NOT_FOUND/)
  assert.match(api, /failureCount < 5/)
  assert.match(api, /postBlob/)
  assert.match(videoThumbnail, /crossOrigin = "anonymous"/)
})
