import { describe, expect, it } from "vitest"
import {
  buildUploadStorageKey,
  getSafeUploadFileName,
  UploadError,
} from "../upload.service"

describe("buildUploadStorageKey", () => {
  it("preserves the uploaded file name and extension in the R2 key", () => {
    expect(buildUploadStorageKey("ws1", "upload-1", "AGENTS.md")).toBe(
      "workspace/ws1/files/upload-1/AGENTS.md",
    )
  })

  it("uses the basename when a browser provides a path-like name", () => {
    expect(buildUploadStorageKey("ws1", "upload-1", "folder/Notes Final.pdf")).toBe(
      "workspace/ws1/files/upload-1/Notes Final.pdf",
    )
  })
})

describe("getSafeUploadFileName", () => {
  it("rejects traversal-style names", () => {
    expect(() => getSafeUploadFileName("../secret.txt")).toThrow(UploadError)
  })
})
