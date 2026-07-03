import { NextRequest, NextResponse } from "next/server"
import { decodeSigningToken, captureViewAndResolve } from "@/lib/esign/store"
import { extractTlsForensics } from "@/lib/telemetry/access-event"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /sign/<token> — the forensic signing proxy. tlsd injects the signer's
// x-tls-ja4 / x-tls-ja3-hash / x-forwarded-for headers before this route runs;
// we record a VIEWED SignatureEvent capturing them, then 302 the recipient on
// to their real Documenso signing URL. Token = base64url("<envelopeId>:<email>")
// (see signingProxyUrl in lib/esign/store).
export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const decoded = decodeSigningToken(token)
  if (!decoded) {
    return NextResponse.json({ error: "Invalid signing link" }, { status: 400 })
  }

  const forensics = extractTlsForensics(req.headers)
  let signingUrl: string | undefined
  try {
    signingUrl = await captureViewAndResolve(
      decoded.envelopeId,
      decoded.recipientEmail,
      forensics,
    )
  } catch {
    // A forensic-write failure must not strand the signer — fall through and
    // let the not-found branch return a clean error (we have no URL anyway).
    signingUrl = undefined
  }

  if (!signingUrl) {
    return NextResponse.json(
      { error: "This signing link is no longer valid or the document has not been sent." },
      { status: 404 },
    )
  }
  return NextResponse.redirect(signingUrl, 302)
}
