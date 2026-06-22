import { describe, it, expect } from "vitest"
import { uploadPdf } from "@/lib/cms/gcs"

// These two validations run BEFORE any GCS call, so no Storage mock is needed.
describe("uploadPdf validation", () => {
  it("rejects a non-PDF content type", async () => {
    await expect(uploadPdf("image/png", Buffer.from("x"), "inv")).rejects.toThrow(/Unsupported file type/)
  })
  it("rejects a PDF over the 10MB cap", async () => {
    const big = Buffer.alloc(10 * 1024 * 1024 + 1)
    await expect(uploadPdf("application/pdf", big, "inv")).rejects.toThrow(/exceeds 10MB/)
  })
})
