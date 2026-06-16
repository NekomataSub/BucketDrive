import { describe, expect, it } from "vitest"
import {
  NO_INDEX_DIRECTIVES,
  buildShareHeadTags,
  buildShareMetadata,
  escapeHtmlAttribute,
  injectShareHead,
  type ShareInfo,
} from "./share-metadata"

const activeShare: ShareInfo = {
  id: "eb92fb55-6c16-4cef-919b-29291e4f569a",
  resourceType: "file",
  resourceName: 'Quarterly "Plan" <draft>.pdf',
  shareType: "external_direct",
  hasPassword: true,
  isActive: true,
  expiresAt: null,
  createdAt: "2026-06-15T00:00:00.000Z",
  brandingLogoUrl: null,
  brandingName: "Acme Drive",
}

describe("share metadata", () => {
  it("builds descriptive metadata for active shares", () => {
    const metadata = buildShareMetadata(activeShare)

    expect(metadata.title).toBe('Quarterly "Plan" <draft>.pdf shared via Acme Drive')
    expect(metadata.description).toBe("Secure shared file on Acme Drive. Password required.")
    expect(metadata.hasPassword).toBe(true)
    expect(metadata.isUnavailable).toBe(false)
  })

  it("falls back to an unavailable card without resource details", () => {
    const metadata = buildShareMetadata({ ...activeShare, isActive: false })

    expect(metadata.title).toBe("Share unavailable")
    expect(metadata.resourceName).toBeNull()
    expect(metadata.isUnavailable).toBe(true)
  })

  it("escapes HTML attributes", () => {
    expect(escapeHtmlAttribute('a "quoted" <value> & more')).toBe(
      "a &quot;quoted&quot; &lt;value&gt; &amp; more",
    )
  })

  it("emits noindex and escaped social tags", () => {
    const metadata = buildShareMetadata(activeShare)
    const tags = buildShareHeadTags({
      metadata,
      pageUrl: "https://example.com/share/abc",
      imageUrl: "https://example.com/og/share/abc.png",
    })

    expect(tags).toContain(`content="${NO_INDEX_DIRECTIVES}"`)
    expect(tags).toContain("Quarterly &quot;Plan&quot; &lt;draft&gt;.pdf shared via Acme Drive")
    expect(tags).toContain('property="og:image" content="https://example.com/og/share/abc.png"')
  })

  it("injects tags into the existing SPA HTML shell", () => {
    const html = "<html><head><title>BucketDrive</title></head><body><div id=\"root\"></div></body></html>"
    const output = injectShareHead(html, "Shared <file>", "<meta name=\"x\" content=\"y\" />")

    expect(output).toContain("<title>Shared &lt;file&gt;</title>")
    expect(output).toContain("<meta name=\"x\" content=\"y\" />")
    expect(output).toContain("<div id=\"root\"></div>")
  })
})
