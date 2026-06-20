/**
 * Maintenance endpoint to mint / list API keys from the CLI WITHOUT a browser
 * session — gated by the shared `x-admin-secret` (same scheme as
 * /api/admin/users). This completes the no-gcloud, fully-CLI bootstrap: after
 * seeding accounts via /api/admin/users, mint the team's first API key here.
 * Day-to-day key management still lives in /admin/api-keys.
 *
 * A key is OWNED by an existing user (by email); at request time it inherits
 * that user's role (see lib/cms/apikey-auth.ts), so mint it for an EDITOR+
 * account if the key needs to publish.
 *
 * POST /api/admin/keys   {"email":"...","name":"..."}  -> {token, prefix} (token shown ONCE)
 *   curl -X POST https://subfrost.io/api/admin/keys \
 *     -H "x-admin-secret: $ADMIN_SECRET" -H "content-type: application/json" \
 *     -d '{"email":"admin@subfrost.io","name":"bootstrap"}'
 *
 * GET  /api/admin/keys   -> list keys (prefix, name, owner, role, revoked)
 */
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createHash, randomBytes } from "crypto"
import prisma from "@/lib/prisma"

export const runtime = "nodejs" // randomBytes + prisma need the Node runtime
export const dynamic = "force-dynamic"

function authorize(request: NextRequest): NextResponse | null {
  const secret = process.env.ADMIN_SECRET
  if (!secret) {
    return NextResponse.json({ error: "ADMIN_SECRET not configured" }, { status: 503 })
  }
  if (request.headers.get("x-admin-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return null
}

function sha256(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

const bodySchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120).optional(),
})

export async function POST(request: NextRequest) {
  const denied = authorize(request)
  if (denied) return denied

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })
  }

  const email = parsed.data.email.toLowerCase()
  const owner = await prisma.user.findUnique({ where: { email } })
  if (!owner) {
    return NextResponse.json(
      { error: `No user ${email} — seed it via /api/admin/users first` },
      { status: 404 },
    )
  }

  // Same scheme as the /admin/api-keys server action: plaintext returned ONCE,
  // only the sha-256 hash is stored. prefix = "sk_" + first 8 hex chars.
  const name = parsed.data.name?.trim() || `cli-${new Date().toISOString().slice(0, 10)}`
  const token = `sk_${randomBytes(24).toString("hex")}`
  const prefix = token.slice(0, 11)
  await prisma.apiKey.create({
    data: { name, hashedKey: sha256(token), prefix, userId: owner.id },
  })

  return NextResponse.json(
    { ok: true, token, prefix, owner: { email: owner.email, role: owner.role } },
    { status: 201 },
  )
}

export async function GET(request: NextRequest) {
  const denied = authorize(request)
  if (denied) return denied

  const keys = await prisma.apiKey.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      prefix: true,
      revoked: true,
      lastUsedAt: true,
      createdAt: true,
      createdBy: { select: { email: true, role: true } },
    },
  })
  return NextResponse.json({ ok: true, count: keys.length, keys })
}
