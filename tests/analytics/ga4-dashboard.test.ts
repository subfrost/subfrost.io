import { describe, it, expect, vi, beforeEach } from "vitest"

const client = vi.hoisted(() => ({ article: { findMany: vi.fn() } }))
vi.mock("@/lib/prisma", () => ({ prisma: client, default: client }))
// cacheGetOrCompute just runs the compute fn (no real cache in the test).
vi.mock("@/lib/redis", () => ({ cacheGetOrCompute: vi.fn((_k: string, fn: () => unknown) => fn()) }))
vi.mock("@/lib/analytics/google-auth", () => ({ getGoogleAccessToken: vi.fn().mockResolvedValue("tok") }))

import { parseArticleSlug, ga4Source } from "@/lib/analytics/ga4"
import { cacheGetOrCompute } from "@/lib/redis"
import { getGoogleAccessToken } from "@/lib/analytics/google-auth"

beforeEach(() => {
  // mockReset:true in vitest.config.ts resets implementations before each test;
  // re-apply the factory defaults so the mocks behave as the brief intends.
  vi.mocked(cacheGetOrCompute).mockImplementation((_k: string, fn: () => unknown) => fn() as ReturnType<typeof cacheGetOrCompute>)
  vi.mocked(getGoogleAccessToken).mockResolvedValue("tok")
  process.env.GA4_PROPERTY_ID = "123"
  process.env.GA_SERVICE_ACCOUNT_JSON = "{}"
})

describe("parseArticleSlug", () => {
  it("extracts the slug from an /articles/ path, ignoring query + locale", () => {
    expect(parseArticleSlug("/articles/hello-world")).toBe("hello-world")
    expect(parseArticleSlug("/articles/hello-world?lang=zh")).toBe("hello-world")
  })
  it("returns null for non-article paths", () => {
    expect(parseArticleSlug("/")).toBeNull()
    expect(parseArticleSlug("/articles")).toBeNull()
  })
})

it("getDashboard assembles four sections + joins article titles", async () => {
  const article = {
    rows: [{ dimensionValues: [{ value: "/articles/foo" }, { value: "Foo page" }], metricValues: [{ value: "40" }, { value: "200" }] }],
  }
  // runReport is called 4×; return the article shape only for the 4th (article) call,
  // empty for the others — we only assert the article join + configured here.
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => article }))
  client.article.findMany.mockResolvedValue([
    { translations: [{ title: "Foo (CMS)" }], slug: "foo" },
  ])

  const dash = await ga4Source.getDashboard({ start: "28daysAgo", end: "today", preset: "28d" })
  expect(dash.configured).toBe(true)
  const row = dash.articleEngagement.find((r) => r.slug === "foo")!
  expect(row.title).toBe("Foo (CMS)")        // CMS title wins over GA page title
  expect(row.pageViews).toBe(40)
  expect(row.avgEngagementSeconds).toBe(5)   // userEngagementDuration 200 / 40 pageViews
})

it("returns an empty unconfigured dashboard without network when env is absent", async () => {
  delete process.env.GA4_PROPERTY_ID
  delete process.env.GA_SERVICE_ACCOUNT_JSON
  const fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
  const dash = await ga4Source.getDashboard({ start: "28daysAgo", end: "today", preset: "28d" })
  expect(dash.configured).toBe(false)
  expect(dash.articleEngagement).toEqual([])
  expect(fetchMock).not.toHaveBeenCalled()
})
