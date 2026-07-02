/**
 * Pager acknowledgment — the ACK button in every urgent notification points
 * here. Unauthenticated BY DESIGN: the token is an unguessable per-(page,
 * member) cuid minted at send time, single-purpose, and acking is the only
 * thing it can do (idempotently). POST from the ntfy action button; GET so a
 * tapped link in a browser works too.
 */
import { NextResponse } from "next/server"
import { acknowledge } from "@/lib/pager/send"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function handle(token: string) {
  const target = await acknowledge(token)
  if (!target) return new NextResponse("Unknown ack token", { status: 404 })
  return new NextResponse(
    `✓ Acknowledged — thanks, ${target.memberId}. Repeats stopped.`,
    { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } },
  )
}

export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  return handle((await params).token)
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  return handle((await params).token)
}
