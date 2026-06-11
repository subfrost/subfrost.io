"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createApiKey, revokeApiKey } from "@/actions/cms/apikeys"

export interface KeyRow {
  id: string
  name: string
  prefix: string
  revoked: boolean
  lastUsedAt: string | null
  createdAt: string
}

export function ApiKeysManager({ keys }: { keys: KeyRow[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState("")
  const [newToken, setNewToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function onCreate(e: React.FormEvent) {
    e.preventDefault(); setError(null); setNewToken(null)
    startTransition(async () => {
      const res = await createApiKey(name)
      if (res.ok) { setNewToken(res.token); setName(""); router.refresh() } else setError(res.error)
    })
  }

  return (
    <div className="max-w-2xl space-y-6">
      <p className="text-sm text-zinc-400">
        Use a key as <code className="text-zinc-200">Authorization: Bearer &lt;token&gt;</code> when POSTing
        markdown to <code className="text-zinc-200">/api/admin/articles</code>.
      </p>

      <form onSubmit={onCreate} className="flex items-end gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="flex-1">
          <label className="mb-1.5 block text-sm text-zinc-300">Key name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ci-uploader" required className="bg-zinc-900 text-zinc-100 border-zinc-700" />
        </div>
        <Button type="submit" disabled={pending}>Create key</Button>
      </form>
      {error && <p className="text-sm text-red-400">{error}</p>}

      {newToken && (
        <div className="rounded-xl border border-emerald-700/50 bg-emerald-950/30 p-4">
          <p className="text-sm text-emerald-300">Copy this token now — it won&apos;t be shown again:</p>
          <code className="mt-2 block break-all rounded bg-black/50 p-3 text-sm text-emerald-200">{newToken}</code>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/60 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Prefix</th><th className="px-4 py-3">Last used</th><th className="px-4 py-3"></th></tr>
          </thead>
          <tbody>
            {keys.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-zinc-500">No keys yet.</td></tr>}
            {keys.map((k) => (
              <tr key={k.id} className="border-t border-zinc-800">
                <td className="px-4 py-3 text-white">{k.name}{k.revoked && <span className="ml-2 text-xs text-red-400">(revoked)</span>}</td>
                <td className="px-4 py-3 font-mono text-zinc-400">{k.prefix}…</td>
                <td className="px-4 py-3 text-zinc-500">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : "never"}</td>
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
