"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PRIVILEGE_LABELS, type Privilege } from "@/lib/cms/privileges"
import { createApiKey, revokeApiKey } from "@/actions/cms/apikeys"

export interface KeyRow {
  id: string
  name: string
  prefix: string
  scopes: Privilege[]
  revoked: boolean
  lastUsedAt: string | null
  expiresAt: string | null
  createdAt: string
  ownerEmail: string | null
}

export function ApiKeysManager({
  keys,
  grantableScopes,
  showOwner,
}: {
  keys: KeyRow[]
  grantableScopes: Privilege[]
  showOwner: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState("")
  const [scopes, setScopes] = useState<Privilege[]>([])
  const [expiresInDays, setExpiresInDays] = useState("")
  const [newToken, setNewToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function onCreate(e: React.FormEvent) {
    e.preventDefault(); setError(null); setNewToken(null)
    const days = expiresInDays ? Number(expiresInDays) : undefined
    startTransition(async () => {
      const res = await createApiKey(name, scopes, days)
      if (res.ok) { setNewToken(res.token); setName(""); setScopes([]); setExpiresInDays(""); router.refresh() }
      else setError(res.error)
    })
  }

  const expired = (iso: string | null) => iso != null && new Date(iso).getTime() < Date.now()

  return (
    <div className="max-w-3xl space-y-6">
      <p className="text-sm text-zinc-400">
        Use a key as <code className="text-zinc-200">Authorization: Bearer &lt;token&gt;</code> when POSTing
        markdown to <code className="text-zinc-200">/api/admin/articles</code>. A key&apos;s power is capped to its
        scopes (an unscoped key inherits your privileges).
      </p>

      <form onSubmit={onCreate} className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[12rem]">
            <Label className="mb-1.5 block text-sm text-zinc-300">Key name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ci-uploader" required className="bg-zinc-900 text-zinc-100 border-zinc-700" />
          </div>
          <div className="w-40">
            <Label className="mb-1.5 block text-sm text-zinc-300">Expires in (days)</Label>
            <Input type="number" min={1} value={expiresInDays} onChange={(e) => setExpiresInDays(e.target.value)} placeholder="never" className="bg-zinc-900 text-zinc-100 border-zinc-700" />
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-sm text-zinc-300">Scopes <span className="text-zinc-500">(none = full access of your privileges)</span></Label>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {grantableScopes.map((p) => (
              <label key={p} className="flex items-center gap-2 text-xs text-zinc-300">
                <input type="checkbox" checked={scopes.includes(p)}
                  onChange={(e) => setScopes(e.target.checked ? [...scopes, p] : scopes.filter((x) => x !== p))} />
                {PRIVILEGE_LABELS[p]}
              </label>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>Create key</Button>
          {error && <span className="text-sm text-red-400">{error}</span>}
        </div>
      </form>

      {newToken && (
        <div className="rounded-xl border border-emerald-700/50 bg-emerald-950/30 p-4">
          <p className="text-sm text-emerald-300">Copy this token now — it won&apos;t be shown again:</p>
          <code className="mt-2 block break-all rounded bg-black/50 p-3 text-sm text-emerald-200">{newToken}</code>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/60 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              {showOwner && <th className="px-4 py-3">Owner</th>}
              <th className="px-4 py-3">Scopes</th>
              <th className="px-4 py-3">Last used</th>
              <th className="px-4 py-3">Expires</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {keys.length === 0 && <tr><td colSpan={showOwner ? 6 : 5} className="px-4 py-8 text-center text-zinc-500">No keys yet.</td></tr>}
            {keys.map((k) => (
              <tr key={k.id} className="border-t border-zinc-800 align-top">
                <td className="px-4 py-3">
                  <div className="text-white">{k.name}{k.revoked && <span className="ml-2 text-xs text-red-400">(revoked)</span>}</div>
                  <div className="font-mono text-xs text-zinc-500">{k.prefix}…</div>
                </td>
                {showOwner && <td className="px-4 py-3 text-zinc-400">{k.ownerEmail ?? "—"}</td>}
                <td className="px-4 py-3 text-xs text-zinc-400">
                  {k.scopes.length === 0 ? <span className="text-zinc-500">unscoped</span> : k.scopes.map((s) => PRIVILEGE_LABELS[s]).join(", ")}
                </td>
                <td className="px-4 py-3 text-zinc-500">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : "never"}</td>
                <td className={`px-4 py-3 ${expired(k.expiresAt) ? "text-red-400" : "text-zinc-500"}`}>
                  {k.expiresAt ? `${new Date(k.expiresAt).toLocaleDateString()}${expired(k.expiresAt) ? " (expired)" : ""}` : "never"}
                </td>
                <td className="px-4 py-3 text-right">
                  {!k.revoked && (
                    <Button size="sm" variant="ghost" disabled={pending}
                      onClick={() => startTransition(async () => { await revokeApiKey(k.id); router.refresh() })}>
                      Revoke
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
