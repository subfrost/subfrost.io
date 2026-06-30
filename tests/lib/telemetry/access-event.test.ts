import { describe, it, expect } from "vitest"
import { buildAccessEvent, dailyIndex, hasFingerprint } from "@/lib/telemetry/access-event"

const base = {
  ja3: "h", ja3_full: "f", ja4: "j", host: "subfrost.io", path: "/articles/x",
  method: "GET", status: 200, sourceIp: "1.2.3.4", userAgent: "UA", xff: "1.2.3.4",
  instance: "edge-middleware", latencyMs: 0,
}

describe("access-event", () => {
  it("dailyIndex formats UTC date", () => {
    expect(dailyIndex(new Date("2026-06-30T23:00:00Z"))).toBe("subfrost-cdn-2026.06.30")
  })
  it("hasFingerprint is true if any present, false if all empty", () => {
    expect(hasFingerprint("", "", "j")).toBe(true)
    expect(hasFingerprint("", "", "")).toBe(false)
  })
  it("buildAccessEvent shapes strict top-level + headers", () => {
    const e = buildAccessEvent({ ...base, referer: "https://x.com/s", utm: { utm_source: "tw" } }, new Date("2026-06-30T12:00:00Z"))
    expect(e.service).toBe("tlsd-ingress")
    expect(e.path).toBe("/articles/x")
    expect(e.source_ip).toBe("1.2.3.4")
    expect(e.ja4).toBe("j")
    expect(e.headers.referer).toBe("https://x.com/s")
    expect(e.headers.utm_source).toBe("tw")
    expect(e.headers["user-agent"]).toBe("UA")
    expect(e.bytes_out).toBe(0)
    expect(e.headers_truncated).toBe(false)
  })
})
