"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { login, loginVerify2fa } from "@/actions/cms/auth"

export default function AdminLoginPage() {
  const router = useRouter()
  const params = useSearchParams()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<"credentials" | "twofa">("credentials")
  const [code, setCode] = useState("")
  const [useRecovery, setUseRecovery] = useState(false)

  function done() {
    router.push(params.get("from") || "/admin")
    router.refresh()
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    const res = await login(email, password)
    if (res.ok && res.twofa) { setStep("twofa"); setLoading(false) }
    else if (res.ok) done()
    else { setError(res.error); setLoading(false) }
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    const res = await loginVerify2fa(code)
    if (res.ok) done()
    else { setError(res.error); setLoading(false) }
  }

  const inputCls = "bg-zinc-900 text-zinc-100 border-zinc-700"

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8">
        <div className="mb-6 text-center">
          <div className="text-xl font-bold text-white">SUBFROST</div>
          <div className="text-xs uppercase tracking-widest text-zinc-500">Admin</div>
        </div>

        {step === "credentials" ? (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-zinc-300">Email</Label>
              <Input id="email" type="email" autoComplete="username" value={email}
                onChange={(e) => setEmail(e.target.value)} required className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-zinc-300">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" value={password}
                onChange={(e) => setPassword(e.target.value)} required className={inputCls} />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Signing in…" : "Sign in"}
            </Button>
            <a href="/admin/forgot-password" className="block text-center text-xs text-zinc-500 hover:text-zinc-300">
              Forgot password?
            </a>
          </form>
        ) : (
          <form onSubmit={onVerify} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="code" className="text-zinc-300">
                {useRecovery ? "Recovery code" : "Authenticator code"}
              </Label>
              <Input id="code" inputMode={useRecovery ? "text" : "numeric"} autoFocus autoComplete="one-time-code"
                value={code} onChange={(e) => setCode(e.target.value)} required
                placeholder={useRecovery ? "XXXXXXXX" : "123456"} className={`${inputCls} tracking-widest`} />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Verifying…" : "Verify"}
            </Button>
            <button type="button" onClick={() => { setUseRecovery((v) => !v); setCode(""); setError(null) }}
              className="block w-full text-center text-xs text-zinc-500 hover:text-zinc-300">
              {useRecovery ? "Use an authenticator code instead" : "Use a recovery code instead"}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
