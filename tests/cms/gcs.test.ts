import { describe, it, expect } from "vitest"
import { objectPath } from "@/lib/cms/gcs"

describe("objectPath", () => {
  it("builds prefixed .opt names", () => {
    expect(objectPath("inline", "foo-ab12cd34", "opt.avif")).toBe("inline/foo-ab12cd34.opt.avif")
    expect(objectPath("covers", "c-1", "opt.png")).toBe("covers/c-1.opt.png")
  })
})
