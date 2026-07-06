import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/cms/authz", () => ({ currentUser: vi.fn() }))
vi.mock("@/lib/redis", () => ({ cacheGet: vi.fn(), cacheSet: vi.fn() }))
vi.mock("@/lib/financials/treasury/source/live", () => ({ fetchTreasurySnapshot: vi.fn() }))

import { treasuryOverviewAction } from "@/actions/cms/financials"
import { FINANCIALS_PRIVILEGE } from "@/lib/financials/privilege"
import { currentUser } from "@/lib/cms/authz"
import { cacheGet, cacheSet } from "@/lib/redis"
import { fetchTreasurySnapshot } from "@/lib/financials/treasury/source/live"

const snap = { wallets: [], grandTotalUsd: 0, fetchedAt: "2026-06-22T00:00:00Z" }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(currentUser).mockResolvedValue({ privileges: [FINANCIALS_PRIVILEGE] } as never)
  vi.mocked(cacheGet).mockResolvedValue(null)
  vi.mocked(cacheSet).mockResolvedValue(undefined)
})

describe("treasuryOverviewAction", () => {
  it("rejects a caller without the financials privilege", async () => {
    vi.mocked(currentUser).mockResolvedValue({ privileges: [] } as never)
    expect(await treasuryOverviewAction()).toEqual({ ok: false, error: "unauthorized" })
    expect(fetchTreasurySnapshot).not.toHaveBeenCalled()
  })

  it("serves a cache hit without calling the provider", async () => {
    vi.mocked(cacheGet).mockResolvedValueOnce(snap as never)
    const r = await treasuryOverviewAction()
    expect(r).toEqual({ ok: true, snapshot: snap })
    expect(fetchTreasurySnapshot).not.toHaveBeenCalled()
  })

  it("fetches + caches on a miss", async () => {
    vi.mocked(fetchTreasurySnapshot).mockResolvedValueOnce(snap as never)
    const r = await treasuryOverviewAction()
    expect(r).toEqual({ ok: true, snapshot: snap })
    expect(cacheSet).toHaveBeenCalledWith("financials:treasury", snap, 300)
    expect(cacheSet).toHaveBeenCalledWith("financials:treasury:last", snap, 86_400)
  })

  it("serves last-good (stale) when the provider throws", async () => {
    vi.mocked(fetchTreasurySnapshot).mockRejectedValueOnce(new Error("upstream down"))
    vi.mocked(cacheGet).mockResolvedValueOnce(null).mockResolvedValueOnce(snap as never) // miss live, hit last-good
    const r = await treasuryOverviewAction()
    expect(r).toEqual({ ok: true, snapshot: snap, stale: true })
  })

  it("returns upstream when the provider throws and there is no last-good", async () => {
    vi.mocked(fetchTreasurySnapshot).mockRejectedValueOnce(new Error("upstream down"))
    vi.mocked(cacheGet).mockResolvedValue(null)
    expect(await treasuryOverviewAction()).toEqual({ ok: false, error: "upstream" })
  })
})
