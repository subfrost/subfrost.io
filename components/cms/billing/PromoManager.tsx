"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { listPromoCodesAction, createPromoCodeAction } from "@/actions/cms/billing"
import { PROMO_TYPES, PROMO_TYPE_LABELS } from "@/lib/stripe/shapes"
import type { PromoCode } from "@/lib/stripe/shapes"

function formatValue(type: "PERCENT" | "AMOUNT", value: number): string {
  if (type === "PERCENT") return `${value}%`
  return `$${(value / 100).toFixed(2)}`
}

interface FormState {
  code: string
  type: (typeof PROMO_TYPES)[number]
  value: string
  maxRedemptions: string
  expiresAt: string
}

function defaultForm(): FormState {
  return { code: "", type: "PERCENT", value: "", maxRedemptions: "", expiresAt: "" }
}

export function PromoManager() {
  const [codes, setCodes] = useState<PromoCode[]>([])
  const [loading, setLoading] = useState(true)
  const [banner, setBanner] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(defaultForm())
  const [formError, setFormError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const fetchCodes = useCallback(async () => {
    const res = await listPromoCodesAction()
    if (res.ok) {
      setCodes(res.codes)
      setBanner(null)
      return true
    } else {
      setBanner(res.error)
      return false
    }
  }, [])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    await fetchCodes()
    setLoading(false)
  }, [fetchCodes])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const setField = (field: keyof FormState, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }))

  const handleCreate = () =>
    startTransition(async () => {
      setFormError(null)
      const res = await createPromoCodeAction({
        code: form.code,
        type: form.type,
        value: Number(form.value),
        maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : undefined,
        expiresAt: form.expiresAt || undefined,
      })
      if (res.ok) {
        setForm(defaultForm())
        await fetchCodes()
      } else {
        setFormError(res.error)
      }
    })

  if (loading) return <div className="text-zinc-500">Loading…</div>

  return (
    <div className="space-y-8">
      {banner && (
        <div className="rounded-lg bg-red-950/40 p-3 text-sm text-red-300">
          {banner}
          <button type="button" onClick={() => setBanner(null)} className="ml-2 underline">
            dismiss
          </button>
        </div>
      )}

      {/* Create form */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">Create promo code</h2>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          {formError && (
            <div className="mb-4 rounded-lg bg-red-950/40 p-3 text-sm text-red-300">
              {formError}
              <button type="button" onClick={() => setFormError(null)} className="ml-2 underline">
                dismiss
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Code</label>
              <Input
                value={form.code}
                onChange={(e) => setField("code", e.target.value)}
                placeholder="e.g. LAUNCH20"
                className="border-zinc-700 bg-zinc-900 text-zinc-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-zinc-500">Type</label>
              <select
                value={form.type}
                onChange={(e) => setField("type", e.target.value as (typeof PROMO_TYPES)[number])}
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              >
                {PROMO_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {PROMO_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-zinc-500">
                Value {form.type === "PERCENT" ? "(percent, e.g. 20)" : "(cents, e.g. 500 = $5.00)"}
              </label>
              <Input
                type="number"
                min={1}
                value={form.value}
                onChange={(e) => setField("value", e.target.value)}
                placeholder={form.type === "PERCENT" ? "20" : "500"}
                className="border-zinc-700 bg-zinc-900 text-zinc-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-zinc-500">Max redemptions (optional)</label>
              <Input
                type="number"
                min={1}
                value={form.maxRedemptions}
                onChange={(e) => setField("maxRedemptions", e.target.value)}
                placeholder="Unlimited"
                className="border-zinc-700 bg-zinc-900 text-zinc-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-zinc-500">Expires at (optional)</label>
              <Input
                type="date"
                value={form.expiresAt}
                onChange={(e) => setField("expiresAt", e.target.value)}
                className="border-zinc-700 bg-zinc-900 text-zinc-100"
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <Button onClick={handleCreate} disabled={!form.code || !form.value}>
              Create
            </Button>
          </div>
        </div>
      </section>

      {/* Codes list */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">Existing codes</h2>
        {codes.length === 0 ? (
          <p className="text-sm text-zinc-500">No promo codes yet.</p>
        ) : (
          <ul className="space-y-3">
            {codes.map((c) => (
              <li key={c.code} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-mono font-semibold text-white">{c.code}</span>
                  <span className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-400">
                    {PROMO_TYPE_LABELS[c.type]}
                  </span>
                  <span
                    className={
                      c.active
                        ? "rounded-md border border-green-700/50 bg-green-950/40 px-2 py-0.5 text-xs font-medium text-green-400"
                        : "rounded-md border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-500"
                    }
                  >
                    {c.active ? "Active" : "Inactive"}
                  </span>
                </div>

                <div className="flex flex-wrap gap-4 text-sm text-zinc-400">
                  <span>Value: {formatValue(c.type, c.value)}</span>
                  <span>
                    Redemptions: {c.redemptions} / {c.maxRedemptions ?? "∞"}
                  </span>
                  <span>
                    Expires:{" "}
                    {c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : "no expiry"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
