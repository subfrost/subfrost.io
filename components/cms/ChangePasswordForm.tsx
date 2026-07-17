"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { changePassword } from "@/actions/cms/auth"

export function ChangePasswordForm() {
  const [pending, startTransition] = useTransition()
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setMsg(null)
    if (next !== confirm) { setError("New passwords don't match"); return }
    if (next.length < 8) { setError("New password must be at least 8 characters"); return }
    startTransition(async () => {
      const res = await changePassword(current, next)
      if (res.ok) {
        setMsg("Password changed. Other sessions have been signed out.")
        setCurrent(""); setNext(""); setConfirm("")
      } else setError(res.error)
    })
  }

  const cls = "border-[color:var(--ed-hair)] bg-[color:var(--ed-surface)] text-[color:var(--ed-ink)]"
  return (
    <form onSubmit={submit} className="space-y-4 border-t border-[color:var(--ed-hair)] pt-5">
      <div className="text-sm font-medium text-[color:var(--ed-ink)]">Change password</div>
      <div className="space-y-1.5">
        <Label className="text-[color:var(--ed-body)]">Current password</Label>
        <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required className={cls} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-[color:var(--ed-body)]">New password</Label>
        <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} className={cls} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-[color:var(--ed-body)]">Confirm new password</Label>
        <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} className={cls} />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>Update password</Button>
        {msg && <span className="text-sm text-[#1ea463]">{msg}</span>}
        {error && <span className="text-sm text-[#b8321a]">{error}</span>}
      </div>
    </form>
  )
}
