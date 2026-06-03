import { describe, expect, it } from "vitest"
import { buildFtsQuery, filterFilesByFolder, getMimePrefixesForCategory } from "./file-query"

describe("buildFtsQuery", () => {
  it("builds a prefix query for sanitized tokens", () => {
    expect(buildFtsQuery("budget 2025")).toBe("budget* AND 2025*")
  })

  it("removes unsafe characters before building the match expression", () => {
    expect(buildFtsQuery('report (draft) "q1"')).toBe("report* AND draft* AND q1*")
  })
})

describe("getMimePrefixesForCategory", () => {
  it("returns image prefixes for the images filter", () => {
    expect(getMimePrefixesForCategory("images")).toEqual(["image/"])
  })

  it("returns an empty list for all files", () => {
    expect(getMimePrefixesForCategory("all")).toEqual([])
  })
})

describe("filterFilesByFolder", () => {
  const files = [
    { id: "root-file", folderId: null },
    { id: "nested-file", folderId: "00000000-0000-4000-8000-000000000001" },
    { id: "other-nested-file", folderId: "00000000-0000-4000-8000-000000000002" },
  ]

  it("returns only root files when no folder id is provided", () => {
    expect(filterFilesByFolder(files).map((file) => file.id)).toEqual(["root-file"])
  })

  it("returns only files in the requested folder", () => {
    expect(
      filterFilesByFolder(files, "00000000-0000-4000-8000-000000000001").map(
        (file) => file.id,
      ),
    ).toEqual(["nested-file"])
  })
})
