import { NextRequest, NextResponse } from "next/server"
import { syncEcosystemStats } from "@/lib/ecosystem/stats-sync"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const secret = process.env.PREFETCH_SECRET
  if (secret) {
    const auth = request.headers.get("authorization")
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }
  const t0 = Date.now()
  try {
    const r = await syncEcosystemStats()
    return NextResponse.json({ ok: true, ...r, ms: Date.now() - t0 })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
