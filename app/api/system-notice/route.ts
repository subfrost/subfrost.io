import { NextResponse } from "next/server"
import { getSystemNotice, toNoticePayload } from "@/lib/cms/system-notice"

export const dynamic = "force-dynamic"

export async function GET() {
  const payload = toNoticePayload(await getSystemNotice())
  return NextResponse.json(payload, {
    headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=30" },
  })
}
