import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/cms/system-notice", () => ({
  getSystemNotice: vi.fn(),
  // use the real toNoticePayload
  toNoticePayload: (dto: Record<string, unknown>) => ({
    enabled: dto.enabled, showBanner: dto.showBanner, showModal: dto.showModal,
    en: { title: dto.titleEn, message: dto.messageEn },
    zh: { title: dto.titleZh, message: dto.messageZh },
  }),
}))

import { getSystemNotice } from "@/lib/cms/system-notice"
import { GET } from "@/app/api/system-notice/route"

beforeEach(() => vi.clearAllMocks())

it("returns the locale-nested payload with a short cache header", async () => {
  vi.mocked(getSystemNotice).mockResolvedValue({
    enabled: true, showBanner: true, showModal: false,
    titleEn: "T", messageEn: "M", titleZh: "标题", messageZh: "正文",
    updatedAt: null, updatedBy: null,
  })
  const res = await GET()
  expect(res.headers.get("Cache-Control")).toMatch(/max-age=30/)
  const body = await res.json()
  expect(body).toEqual({
    enabled: true, showBanner: true, showModal: false,
    en: { title: "T", message: "M" }, zh: { title: "标题", message: "正文" },
  })
})
