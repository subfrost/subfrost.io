import { NextRequest, NextResponse } from "next/server"
import { randomBytes, createHash } from "crypto"
import prisma from "@/lib/prisma"
import { audit } from "@/lib/cms/audit"
import { requireScope, requireGrantable, readJson, ok, fail, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/v1/keys — list API keys (scope: apikeys.manage).
export async function GET(req: NextRequest) {
  const actor = await requireScope(req, "apikeys.manage")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const keys = await prisma.apiKey.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true, name: true, prefix: true, scopes: true, revoked: true,
        lastUsedAt: true, expiresAt: true, createdAt: true,
        createdBy: { select: { email: true, role: true } },
      },
    })
    return ok({ count: keys.length, keys })
  })
}

// POST /api/v1/keys — mint a scoped key owned by the caller (scope:
// apikeys.manage; requested scopes must be ⊆ the caller's privileges).
// Returns the token ONCE.
export async function POST(req: NextRequest) {
  const actor = await requireScope(req, "apikeys.manage")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const body = await readJson<{ name?: string; scopes?: string[]; expiresInDays?: number }>(req)
    if (body instanceof NextResponse) return body
    const name = (body.name ?? "").trim() || `cli-${new Date().toISOString().slice(0, 10)}`
    const scopes = Array.isArray(body.scopes) ? body.scopes : []
    const grant = requireGrantable(actor, scopes)
    if (grant) return grant

    const token = `sk_${randomBytes(24).toString("hex")}`
    const expiresAt =
      body.expiresInDays && body.expiresInDays > 0
        ? new Date(Date.now() + body.expiresInDays * 86_400_000)
        : null
    const key = await prisma.apiKey.create({
      data: {
        name,
        hashedKey: createHash("sha256").update(token).digest("hex"),
        prefix: token.slice(0, 11),
        scopes,
        userId: actor.id,
        expiresAt,
      },
      select: { id: true, name: true, prefix: true, scopes: true, expiresAt: true },
    })
    await audit("key_mint", { actorId: actor.id, target: key.prefix, details: { scopes } })
    // token returned exactly once
    return ok({ ...key, token }, 201)
  })
}
