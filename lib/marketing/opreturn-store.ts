import prisma from "@/lib/prisma"
import { OPRETURN_COLUMNS, OPRETURN_OPTIONAL_COLUMNS, type OpReturnRow } from "./opreturn-types"

type DbRow = Record<string, unknown>

function map(r: DbRow): OpReturnRow {
  const out = { date: String(r.date) } as OpReturnRow
  for (let i = 1; i < OPRETURN_COLUMNS.length; i++) {
    ;(out as unknown as Record<string, number>)[OPRETURN_COLUMNS[i]] = Number(r[OPRETURN_COLUMNS[i]])
  }
  for (const name of OPRETURN_OPTIONAL_COLUMNS) {
    const v = r[name]
    ;(out as unknown as Record<string, number | null>)[name] = v === null || v === undefined ? null : Number(v)
  }
  return out
}

export async function listOpReturnDaily(): Promise<OpReturnRow[]> {
  const rows = (await prisma.opReturnDaily.findMany({ orderBy: { date: "asc" } })) as DbRow[]
  return rows.map(map)
}

export async function opReturnMeta(): Promise<{ count: number; latestDate: string | null; latestUpdatedAt: Date | null }> {
  const [count, latest] = await Promise.all([
    prisma.opReturnDaily.count(),
    prisma.opReturnDaily.findFirst({ orderBy: { date: "desc" }, select: { date: true, updatedAt: true } }),
  ])
  return { count, latestDate: latest?.date ?? null, latestUpdatedAt: latest?.updatedAt ?? null }
}
