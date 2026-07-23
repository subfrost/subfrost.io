import { describe, it, expect, vi } from "vitest"
import { fetchVerifiedSource, repoShortName } from "@/lib/ecosystem/verified-source"

// Shape copied from a real response of
// GET https://explorer.subfrost.io/api/v1/subfrost/source/32/0 (frBTC, 2026-07-23).
const FRBTC = {
  ok: true,
  source: {
    alkane: "32:0", block: "32", tx: "0",
    verified: true, verdict: "verified", match_pct: 98.69,
    origin: "db",
    repo: "https://github.com/subfrost/subfrost-alkanes",
    owner: "subfrost", name: "subfrost-alkanes",
    commit: "0748786d1eede608b56ecf1331fe9e1a7c65d463",
    subdir: "alkanes/fr-btc", package: "alkanes/fr-btc",
    entrypoint: "alkanes/fr-btc/src/lib.rs",
    private: true, fileCount: 8,
  },
}

const resOk = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response
const resStatus = (status: number) => ({ ok: false, status, json: async () => ({}) }) as unknown as Response
/** Deep-clones FRBTC and overrides one field of `source`. */
const withSource = (over: Record<string, unknown>) =>
  resOk({ ok: true, source: { ...FRBTC.source, ...over } })

describe("fetchVerifiedSource", () => {
  it("maps a real verified response, including match_pct to matchPct", async () => {
    const fetchImpl = vi.fn(async () => resOk(FRBTC))
    const v = await fetchVerifiedSource("32:0", fetchImpl as never)
    expect(v).toEqual({
      alkaneId: "32:0",
      verdict: "verified",
      matchPct: 98.69,
      origin: "db",
      repo: "https://github.com/subfrost/subfrost-alkanes",
      commit: "0748786d1eede608b56ecf1331fe9e1a7c65d463",
    })
  })

  it("requests /{block}/{tx} built from the alkane id", async () => {
    const fetchImpl = vi.fn(async () => resOk(FRBTC))
    await fetchVerifiedSource("32:0", fetchImpl as never)
    const url = String((fetchImpl.mock.calls[0] as never[])[0])
    expect(url.endsWith("/32/0")).toBe(true)
  })

  it("returns null for every failing HTTP status", async () => {
    for (const status of [400, 401, 404, 500, 502]) {
      expect(await fetchVerifiedSource("32:0", vi.fn(async () => resStatus(status)) as never)).toBeNull()
    }
  })

  it("returns null when the network throws or the body is not JSON", async () => {
    expect(await fetchVerifiedSource("32:0", vi.fn(async () => { throw new Error("down") }) as never)).toBeNull()
    expect(await fetchVerifiedSource("32:0", vi.fn(async () => (
      { ok: true, status: 200, json: async () => { throw new Error("not json") } }
    ) as never) as never)).toBeNull()
  })

  it("returns null when the alkane is not verified", async () => {
    expect(await fetchVerifiedSource("32:0", vi.fn(async () => withSource({ verified: false })) as never)).toBeNull()
    expect(await fetchVerifiedSource("32:0", vi.fn(async () => resOk({ ok: false, error: "no verified source for this alkane" })) as never)).toBeNull()
  })

  it("returns null on a verdict outside the two badge-carrying outcomes", async () => {
    for (const verdict of ["pending", "failed", "", null]) {
      expect(await fetchVerifiedSource("32:0", vi.fn(async () => withSource({ verdict })) as never)).toBeNull()
    }
  })

  it("returns null on an out-of-range or non-numeric match_pct", async () => {
    for (const match_pct of [null, "98.7", Number.NaN, Number.POSITIVE_INFINITY, -1, 101]) {
      expect(await fetchVerifiedSource("32:0", vi.fn(async () => withSource({ match_pct })) as never)).toBeNull()
    }
  })

  it("returns null on an unusable repo or commit", async () => {
    expect(await fetchVerifiedSource("32:0", vi.fn(async () => withSource({ repo: "not-a-url" })) as never)).toBeNull()
    expect(await fetchVerifiedSource("32:0", vi.fn(async () => withSource({ repo: null })) as never)).toBeNull()
    expect(await fetchVerifiedSource("32:0", vi.fn(async () => withSource({ commit: "" })) as never)).toBeNull()
  })

  it("returns null on an unknown origin, which decides whether we link to GitHub", async () => {
    expect(await fetchVerifiedSource("32:0", vi.fn(async () => withSource({ origin: "s3" })) as never)).toBeNull()
  })

  it("rejects a malformed alkane id without calling the network", async () => {
    const fetchImpl = vi.fn(async () => resOk(FRBTC))
    expect(await fetchVerifiedSource("nope", fetchImpl as never)).toBeNull()
    expect(await fetchVerifiedSource("", fetchImpl as never)).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe("repoShortName", () => {
  it("strips the GitHub host and any trailing .git or slash", () => {
    expect(repoShortName("https://github.com/subfrost/subfrost-alkanes")).toBe("subfrost/subfrost-alkanes")
    expect(repoShortName("https://github.com/Misha-btc/Acai.git")).toBe("Misha-btc/Acai")
    expect(repoShortName("https://github.com/kungfuflex/fire/")).toBe("kungfuflex/fire")
  })

  it("leaves a non-GitHub URL recognisable rather than mangling it", () => {
    expect(repoShortName("https://gitlab.com/x/y")).toBe("https://gitlab.com/x/y")
  })
})
