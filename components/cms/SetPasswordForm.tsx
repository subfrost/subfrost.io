"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { setPasswordWithToken } from "@/actions/cms/account"

export function SetPasswordForm({ token, invite }: { token: string; invite: boolean }) {
  const [pw, setPw] = useState("")
  const [confirm, setConfirm] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (pw !== confirm) { setError("Passwords don't match"); return }
    if (pw.length < 8) { setError("Password must be at least 8 characters"); return }
    setLoading(true)
    const res = await setPasswordWithToken(token, pw)
    if (res.ok) setDone(true)
    else { setError(res.error); setLoading(false) }
  }

  if (done) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-emerald-400">Your password is set. You can sign in now.</p>
        <Link href="/admin/login" className="inline-block rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500">Go to sign in</Link>
      </div>
    )
  }

  const cls = "bg-zinc-900 text-zinc-100 border-zinc-700"
  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-zinc-400">{invite ? "Welcome to the SUBFROST newsroom — choose a password to finish setting up your account." : "Choose a new password for your account."}</p>
      <div className="space-y-1.5">
        <Label className="text-zinc-300">New password</Label>
        <Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={8} className={cls} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-zinc-300">Confirm password</Label>
        <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} className={cls} />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <Button type="submit" disabled={loading} className="w-full">{loading ? "Saving…" : "Set password"}</Button>
    </form>
  )
}
