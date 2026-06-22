/**
 * GET /api/fuel?address=X — FUEL allocation lookup for wallets.
 * subfrost.io owns the allocations table (admin writes via lib/fuel/admin.ts);
 * app.subfrost.io reads them here server-to-server. Auth: shared `x-api-key`
 * (FUEL_API_KEY), mirroring the referral endpoints. Exact-match address, light
 * 60s cache. Shape is { amount: number } to match the app consumer.
 */
import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { cacheGet, cacheSet } from "@/lib/redis"
import { requireApiKey } from "@/lib/api/service-key"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const CACHE_TTL = 60

export async function GET(request: NextRequest) {
  try {
    const denied = requireApiKey(request, process.env.FUEL_API_KEY, "FUEL_API_KEY")
    if (denied) return denied

    const address = new URL(request.url).searchParams.get("address")?.trim() ?? ""
    if (!address) {
      return NextResponse.json({ error: "address query param required" }, { status: 400 })
    }

    const cacheKey = `fuel:public:${address}`
    const cached = await cacheGet<{ amount: number }>(cacheKey)
    if (cached) return NextResponse.json(cached)

    const allocation = await prisma.fuelAllocation.findUnique({
      where: { address },
      select: { amount: true },
    })
    const result = { amount: allocation?.amount ?? 0 }
    await cacheSet(cacheKey, result, CACHE_TTL)

    return NextResponse.json(result)
  } catch (error) {
    console.error("[API /fuel] error:", error)
    return NextResponse.json({ error: "Failed to read fuel allocation" }, { status: 500 })
  }
}
