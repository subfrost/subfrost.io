import { describe, it, expect } from "vitest"
import { isCapturablePageview } from "@/lib/telemetry/capture-path"

describe("isCapturablePageview", () => {
  it("captures public pages", () => {
    for (const p of ["/", "/articles/foo", "/authors/bar", "/about"]) expect(isCapturablePageview(p)).toBe(true)
  })
  it("skips admin/api/internal/assets", () => {
    for (const p of ["/admin", "/admin/login", "/api/fp", "/api/stats", "/_next/static/x.js", "/favicon.ico", "/media/alkanes/btc.png", "/styles.css", "/broadcast"]) {
      expect(isCapturablePageview(p)).toBe(false)
    }
  })
})
