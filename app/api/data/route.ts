import { NextResponse } from "next/server"
import { getPublicData } from "@/lib/marketing/public-data"

export const dynamic = "force-dynamic"

const CACHE = "public, max-age=300, stale-while-revalidate=600"

export async function GET() {
  try {
    const payload = await getPublicData()
    return NextResponse.json(payload, { headers: { "Cache-Control": CACHE } })
  } catch (e) {
    console.error("[api/data] failed", e)
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } })
  }
}
