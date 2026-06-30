// tests/marketing/x-client-fetch.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { resolveAccountId, fetchRecentPosts, isOlderThan, XApiError } from "@/lib/marketing/x-client"

const json = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body }) as Response

beforeEach(() => { vi.stubEnv("X_BEARER_TOKEN", "tok"); vi.stubEnv("X_ACCOUNT_ID", "") })
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe("isOlderThan", () => {
  it("compares against the window using the provided now", () => {
    const now = new Date("2026-06-30T00:00:00Z").getTime()
    expect(isOlderThan("2026-06-20T00:00:00Z", 7, now)).toBe(true)
    expect(isOlderThan("2026-06-28T00:00:00Z", 7, now)).toBe(false)
  })
})

describe("resolveAccountId", () => {
  it("throws not_configured without a bearer token", async () => {
    vi.stubEnv("X_BEARER_TOKEN", "")
    await expect(resolveAccountId()).rejects.toBeInstanceOf(XApiError)
  })
  it("returns X_ACCOUNT_ID without calling the API when set", async () => {
    vi.stubEnv("X_ACCOUNT_ID", "42")
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    expect(await resolveAccountId()).toBe("42")
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it("resolves via users/by/username", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ data: { id: "777" } }))
    vi.stubGlobal("fetch", fetchMock)
    expect(await resolveAccountId()).toBe("777")
    expect(String(fetchMock.mock.calls[0][0])).toContain("/users/by/username/subfrost_news")
  })
})

describe("fetchRecentPosts", () => {
  it("requests public_metrics, excludes retweets/replies, and paginates", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ data: [{ id: "1", text: "a" }], meta: { next_token: "P2" } }))
      .mockResolvedValueOnce(json({ data: [{ id: "2", text: "b" }] }))
    vi.stubGlobal("fetch", fetchMock)
    const out = await fetchRecentPosts("acc", {})
    expect(out.map((t) => t.id)).toEqual(["1", "2"])
    const url0 = String(fetchMock.mock.calls[0][0])
    expect(url0).toContain("/users/acc/tweets")
    expect(url0).toContain("tweet.fields=public_metrics")
    expect(url0).toContain("exclude=retweets%2Creplies")
    expect(String(fetchMock.mock.calls[1][0])).toContain("pagination_token=P2")
  })
  it("throws not_configured without a bearer token", async () => {
    vi.stubEnv("X_BEARER_TOKEN", "")
    await expect(fetchRecentPosts("acc")).rejects.toBeInstanceOf(XApiError)
  })
})
