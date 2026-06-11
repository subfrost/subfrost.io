import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

// Liveness/readiness probe for Kubernetes. Returns 200 without touching the DB
// so a transient DB blip doesn't kill the pod.
export function GET() {
  return NextResponse.json({ status: "ok" })
}
