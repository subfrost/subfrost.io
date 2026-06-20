"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { requestPasswordReset } from "@/actions/cms/account"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await requestPasswordReset(email)
    setSent(true)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8">
        <div className="mb-6 text-center">
          <div className="text-xl font-bold text-white">SUBFROST</div>
          <div className="text-xs uppercase tracking-widest text-zinc-500">Editorial</div>
        </div>
        {sent ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-zinc-300">If an account exists for that email, a reset link is on its way.</p>
            <Link href="/admin/login" className="text-sm text-sky-400 hover:text-sky-300">Back to sign in</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-zinc-400">Enter your email and we&apos;ll send you a link to reset your password.</p>
            <div className="space-y-1.5">
              <Label className="text-zinc-300">Email</Label>
              <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required className="bg-zinc-900 text-zinc-100 border-zinc-700" />
            </div>
            <Button type="submit" disabled={loading} className="w-full">{loading ? "Sending…" : "Send reset link"}</Button>
            <Link href="/admin/login" className="block text-center text-xs text-zinc-500 hover:text-zinc-300">Back to sign in</Link>
          </form>
        )}
      </div>
    </div>
  )
}
