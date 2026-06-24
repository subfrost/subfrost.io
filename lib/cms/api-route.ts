// Shared helpers for the Bearer-key REST API (the surface the `subfrost` CLI
// drives). Each route authenticates a `sk_...` API key via actorFromBearer,
// gates on a privilege code from the IAM registry (the same codes the webapp
// uses), then calls the framework-free lib/<domain> logic the server actions
// call. Keeps every route consistent: same auth, same JSON envelope, same
// error shape.

import { NextResponse } from "next/server"
import { actorFromBearer, type KeyActor } from "@/lib/cms/apikey-auth"
import { canManageRole, type Privilege, type Role } from "@/lib/cms/privileges"

export type { KeyActor }

/** Success envelope. Lists should pass `{ items, count }`-shaped data; single
 *  objects pass the object. The CLI's renderer reads a named array key or the
 *  object fields. */
export function ok(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data ?? { ok: true }, { status })
}

/** Error envelope — always `{ error: string }` so the CLI surfaces a message. */
export function fail(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status })
}

/** Authenticate the request's `Authorization: Bearer sk_...` and require the
 *  given privilege scope. Returns the actor, or a 401/403 NextResponse the
 *  route should return as-is. Pass `null` scope to require only authentication.
 *
 *  Usage:
 *    const actor = await requireScope(req, "fuel.read")
 *    if (actor instanceof NextResponse) return actor
 *    // ... actor.id / actor.privileges / actor.role available
 */
export async function requireScope(
  req: Request,
  scope: Privilege | null,
): Promise<KeyActor | NextResponse> {
  const actor = await actorFromBearer(req.headers.get("authorization"))
  if (!actor) return fail("Invalid or missing API key", 401)
  if (scope && !actor.privileges.includes(scope)) {
    return fail(`Insufficient scope: requires '${scope}'`, 403)
  }
  return actor
}

/** Require ANY of the given scopes (mirrors actions gated on `a || b`). */
export async function requireAnyScope(
  req: Request,
  scopes: Privilege[],
): Promise<KeyActor | NextResponse> {
  const actor = await actorFromBearer(req.headers.get("authorization"))
  if (!actor) return fail("Invalid or missing API key", 401)
  if (scopes.length && !scopes.some((s) => actor.privileges.includes(s))) {
    return fail(`Insufficient scope: requires one of ${scopes.join(", ")}`, 403)
  }
  return actor
}

/** Parse a JSON body; returns the value or a 400 NextResponse. */
export async function readJson<T = unknown>(req: Request): Promise<T | NextResponse> {
  try {
    return (await req.json()) as T
  } catch {
    return fail("Invalid or missing JSON body", 400)
  }
}

/** Role-rank guard mirroring the server actions' `manageable()`: the actor may
 *  manage a target only if it strictly outranks it (ADMIN may manage peer
 *  ADMINs). Returns null when allowed, or a 403 NextResponse. */
export function requireOutranks(actor: KeyActor, targetRole: Role): NextResponse | null {
  const allowed = actor.role === "ADMIN" || canManageRole(actor.role, targetRole)
  if (!allowed) return fail("You cannot manage a user at or above your role", 403)
  return null
}

/** Reject privilege grants the actor doesn't itself hold (anti-escalation),
 *  mirroring the webapp's `ungrantable` guard. Returns null when OK, or 403. */
export function requireGrantable(actor: KeyActor, privileges: Privilege[]): NextResponse | null {
  const ungrantable = privileges.filter((p) => !actor.privileges.includes(p))
  if (ungrantable.length) {
    return fail(`Cannot grant privileges you don't hold: ${ungrantable.join(", ")}`, 403)
  }
  return null
}

/** Wrap a handler so any thrown error becomes a 500 with a clean message
 *  instead of leaking a stack to the client. */
export async function guard(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn()
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Internal error", 500)
  }
}
