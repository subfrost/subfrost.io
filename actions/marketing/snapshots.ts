"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { currentUser, type CmsUser } from "@/lib/cms/authz"
import { audit } from "@/lib/cms/audit"
import { captureSnapshot } from "@/lib/marketing/snapshot"
import { createSnapshot, deleteSnapshot, MarketingError, type SnapshotRow } from "@/lib/marketing/snapshot-store"
import { type SnapshotPayload } from "@/lib/marketing/types"

const PATH = "/admin/marketing/snapshots"
const PRIV = "marketing.view"

const InputSchema = z.object({
  label: z.string().min(1, "A label is required"),
  context: z.enum(["GENERAL", "X_POST", "ARTICLE"]).default("GENERAL"),
  refUrl: z.string().url().optional().or(z.literal("")),
  articleId: z.string().optional(),
  note: z.string().optional(),
})
export type CaptureInput = z.input<typeof InputSchema>

async function ip(): Promise<string | null> {
  const h = await headers()
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null
}

async function gate(): Promise<{ ok: true; me: CmsUser } | { ok: false; error: "unauthorized" }> {
  const me = await currentUser()
  if (!me || !me.privileges.includes(PRIV)) return { ok: false, error: "unauthorized" }
  return { ok: true, me }
}

export async function captureSnapshotAction(
  input: CaptureInput,
): Promise<{ ok: true; value: SnapshotRow } | { ok: false; error: string }> {
  const g = await gate()
  if (!g.ok) return g
  const parsed = InputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  try {
    const payload = await captureSnapshot()
    const value = await createSnapshot(
      {
        label: parsed.data.label,
        context: parsed.data.context,
        refUrl: parsed.data.refUrl ? parsed.data.refUrl : null,
        articleId: parsed.data.articleId || null,
        note: parsed.data.note || null,
      },
      payload,
      g.me.id,
    )
    await audit("marketing_snapshot_create", { actorId: g.me.id, target: value.id, ip: await ip() })
    revalidatePath(PATH)
    return { ok: true, value }
  } catch (e) {
    if (e instanceof MarketingError) return { ok: false, error: e.message }
    throw e
  }
}

export async function deleteSnapshotAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await gate()
  if (!g.ok) return g
  await deleteSnapshot(id)
  await audit("marketing_snapshot_delete", { actorId: g.me.id, target: id, ip: await ip() })
  revalidatePath(PATH)
  return { ok: true }
}

export async function liveSnapshotAction(): Promise<{ ok: true; value: SnapshotPayload } | { ok: false; error: string }> {
  const g = await gate()
  if (!g.ok) return g
  return { ok: true, value: await captureSnapshot() }
}
