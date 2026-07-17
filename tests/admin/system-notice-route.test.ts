import { it, expect, vi, beforeEach } from "vitest"

// Mock only getSystemNotice; keep the REAL toNoticePayload so its audit-field
// handling is exercised: updatedAt is exposed (shown as a timestamp) but the
// updatedBy admin id must never leak.
vi.mock("@/lib/cms/system-notice", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/cms/system-notice")>()
  return { ...actual, getSystemNotice: vi.fn() }
})

import { getSystemNotice } from "@/lib/cms/system-notice"
import { GET } from "@/app/api/system-notice/route"

beforeEach(() => vi.clearAllMocks())

it("returns the locale-nested payload with a short cache header", async () => {
  vi.mocked(getSystemNotice).mockResolvedValue({
    enabled: true, showBanner: true, showModal: false,
    titleEn: "T", messageEn: "M", titleZh: "标题", messageZh: "正文",
    updatedAt: "2026-07-10T00:00:00.000Z", updatedBy: "u9",
  })
  const res = await GET()
  expect(res.headers.get("Cache-Control")).toMatch(/max-age=30/)
  const body = await res.json()
  expect(body).toEqual({
    enabled: true, showBanner: true, showModal: false,
    updatedAt: "2026-07-10T00:00:00.000Z",
    en: { title: "T", message: "M" }, zh: { title: "标题", message: "正文" },
  })
})

it("never leaks audit fields onto the public payload", async () => {
  vi.mocked(getSystemNotice).mockResolvedValue({
    enabled: true, showBanner: true, showModal: true,
    titleEn: "T", messageEn: "M", titleZh: "", messageZh: "",
    updatedAt: "2026-07-10T00:00:00.000Z", updatedBy: "secret-admin-id",
  })
  const body = await (await GET()).json()
  expect(body.updatedAt).toBe("2026-07-10T00:00:00.000Z")
  expect(body).not.toHaveProperty("updatedBy")
  expect(JSON.stringify(body)).not.toContain("secret-admin-id")
})
