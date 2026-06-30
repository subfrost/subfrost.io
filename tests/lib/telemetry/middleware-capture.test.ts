import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/cms/session", () => ({ SESSION_COOKIE: "sf_session", verifySession: vi.fn(async () => null) }))

const emit = vi.hoisted(() => vi.fn(async () => {}))
vi.mock("@/lib/telemetry/access-event", async (orig) => ({ ...(await orig()), emitAccessEvent: emit }))

import { middleware } from "@/middleware"

function ev() { const calls: Promise<unknown>[] = []; return { waitUntil: (p: Promise<unknown>) => calls.push(p), calls } }

describe("middleware capture", () => {
  beforeEach(() => emit.mockClear())
  it("emits for a public pageview with a fingerprint", async () => {
    const req = new NextRequest("http://localhost/articles/foo", { headers: { "x-tls-ja4": "j", "x-forwarded-for": "9.9.9.9" } })
    const e = ev()
    await middleware(req, e as never)
    expect(emit).toHaveBeenCalledTimes(1)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arg = (emit.mock.calls as any[][])[0][0]
    expect(arg.path).toBe("/articles/foo")
    expect(arg.ja4).toBe("j")
  })
  it("does not emit without a fingerprint", async () => {
    const req = new NextRequest("http://localhost/articles/foo")
    await middleware(req, ev() as never)
    expect(emit).not.toHaveBeenCalled()
  })
  it("does not emit for /admin", async () => {
    const req = new NextRequest("http://localhost/admin", { headers: { "x-tls-ja4": "j" } })
    await middleware(req, ev() as never)
    expect(emit).not.toHaveBeenCalled()
  })
})
