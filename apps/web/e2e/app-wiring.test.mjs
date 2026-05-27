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
