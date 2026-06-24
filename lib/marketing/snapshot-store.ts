import prisma from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import type { SnapshotContext, SnapshotPayload } from "@/lib/marketing/types"

export class MarketingError extends Error {}

export interface SnapshotRow {
  id: string
  createdAt: Date
  label: string
  context: SnapshotContext
  refUrl: string | null
  articleId: string | null
  note: string | null
  createdByName: string | null
  articleSlug: string | null
  payload: SnapshotPayload
}

type DbRow = {
  id: string; createdAt: Date; label: string; context: string; refUrl: string | null
  articleId: string | null; note: string | null; payload: unknown
  createdBy: { name: string | null } | null; article: { slug: string } | null
}

const INCLUDE = { createdBy: { select: { name: true } }, article: { select: { slug: true } } }

function map(r: DbRow): SnapshotRow {
  return {
    id: r.id, createdAt: r.createdAt, label: r.label, context: r.context as SnapshotContext,
    refUrl: r.refUrl, articleId: r.articleId, note: r.note,
    createdByName: r.createdBy?.name ?? null, articleSlug: r.article?.slug ?? null,
    payload: r.payload as SnapshotPayload,
  }
}

export async function createSnapshot(
  input: { label: string; context: SnapshotContext; refUrl: string | null; articleId: string | null; note: string | null },
  payload: SnapshotPayload,
  createdById: string | null,
): Promise<SnapshotRow> {
  const label = input.label.trim()
  if (!label) throw new MarketingError("A label is required")
  const r = (await prisma.marketingSnapshot.create({
    data: {
      label,
      context: input.context,
      refUrl: input.refUrl?.trim() || null,
      articleId: input.articleId || null,
      note: input.note?.trim() || null,
      createdById,
      payload: payload as unknown as Prisma.InputJsonValue,
    },
    include: INCLUDE,
  })) as DbRow
  return map(r)
}

export async function listSnapshots(): Promise<SnapshotRow[]> {
  const rows = (await prisma.marketingSnapshot.findMany({
    orderBy: { createdAt: "desc" }, include: INCLUDE,
  })) as DbRow[]
  return rows.map(map)
}

export async function getSnapshot(id: string): Promise<SnapshotRow | null> {
  const r = (await prisma.marketingSnapshot.findUnique({ where: { id }, include: INCLUDE })) as DbRow | null
  return r ? map(r) : null
}

export async function deleteSnapshot(id: string): Promise<void> {
  await prisma.marketingSnapshot.delete({ where: { id } })
}
