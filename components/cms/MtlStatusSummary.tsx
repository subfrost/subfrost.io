"use client"

import { MTL_STATUSES, MTL_STATUS_LABELS, MTL_STATUS_CLS, mtlStatusCounts } from "@/lib/mtl/schema"
import type { MtlRow } from "@/lib/mtl/admin"

/** At-a-glance MTL licensing posture: one chip per status with its count,
 *  in the shared status palette. Presentational — pass all entries. */
export function MtlStatusSummary({ entries }: { entries: MtlRow[] }) {
  const counts = mtlStatusCounts(entries)
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {MTL_STATUSES.map((s) => (
        <div key={s} className={`rounded-lg border px-3 py-2 ${MTL_STATUS_CLS[s]}`}>
          <div className="text-xl font-bold">{counts[s] ?? 0}</div>
          <div className="text-xs opacity-80">{MTL_STATUS_LABELS[s]}</div>
        </div>
      ))}
    </div>
  )
}
