import { NextRequest, NextResponse } from "next/server"
import { captureSnapshot } from "@/lib/marketing/snapshot"
import { createSnapshot, dailySnapshotExistsOn } from "@/lib/marketing/snapshot-store"

export async function GET(request: NextRequest) {
  const secret = process.env.PREFETCH_SECRET
  if (secret) {
    const auth = request.headers.get("authorization")
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  const now = new Date()
  if (await dailySnapshotExistsOn(now)) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const payload = await captureSnapshot()
  const row = await createSnapshot(
    { label: `Daily ${now.toISOString().slice(0, 10)}`, context: "DAILY", refUrl: null, articleId: null, note: null },
    payload,
    null,
  )
  return NextResponse.json({ ok: true, id: row.id, partial: payload.partial })
}
