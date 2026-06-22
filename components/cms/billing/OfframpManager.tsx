"use client"

import { useCallback, useEffect, useState } from "react"
import { listSettlementsAction } from "@/actions/cms/billing"
import { centsToUsd } from "@/lib/stripe/format"
import type { OfframpSettlement } from "@/lib/stripe/shapes"
import { SkeletonTable } from "@/components/cms/Skeleton"

export function OfframpManager() {
  const [settlements, setSettlements] = useState<OfframpSettlement[]>([])
  const [loading, setLoading] = useState(true)
  const [banner, setBanner] = useState<string | null>(null)

  const fetchSettlements = useCallback(async () => {
    setLoading(true)
    const res = await listSettlementsAction()
    if (res.ok) {
      setSettlements(res.settlements)
    } else {
      setBanner(res.error)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchSettlements()
  }, [fetchSettlements])

  if (loading) return <SkeletonTable />

  return (
    <div className="space-y-6">
      {banner && (
        <div className="rounded-lg bg-red-950/40 p-3 text-sm text-red-300">
          {banner}
          <button type="button" onClick={() => setBanner(null)} className="ml-2 underline">
            dismiss
          </button>
        </div>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">
          Settlements{" "}
          <span className="text-sm font-normal text-zinc-500">({settlements.length})</span>
        </h2>
        {settlements.length === 0 ? (
          <p className="text-sm text-zinc-500">No settlements found.</p>
        ) : (
          <ul className="space-y-3">
            {settlements.map((s) => (
              <li key={s.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-white">{s.userId}</span>
                  <span
                    className={
                      s.status === "settled"
                        ? "rounded-md border border-green-700/50 bg-green-950/40 px-2 py-0.5 text-xs font-medium text-green-400"
                        : "rounded-md border border-amber-700/50 bg-amber-950/40 px-2 py-0.5 text-xs font-medium text-amber-400"
                    }
                  >
                    {s.status}
                  </span>
                </div>
                <div className="mb-2 flex flex-wrap gap-4 text-sm text-zinc-400">
                  <span>
                    {s.cryptoAsset} {centsToUsd(s.cryptoAmount)}
                  </span>
                  <span>Fiat: {centsToUsd(s.fiatAmount)}</span>
                  <span>Fee: {centsToUsd(s.feeAmount)}</span>
                </div>
                <div className="text-xs text-zinc-500">
                  {new Date(s.at).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
