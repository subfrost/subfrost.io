"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Image from "next/image"
import { ArrowUpRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { login, loginVerify2fa } from "@/actions/cms/auth"
import { SystemThemeSync } from "@/components/articles/SystemThemeSync"
import { ThemeToggle } from "@/components/articles/ThemeToggle"

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

  const inputCls =
    "h-12 rounded-[6px] border bg-[color:var(--ed-surface)] text-[color:var(--ed-ink)] focus-visible:ring-[color:var(--ed-ice)]"
  const buttonCls =
    "h-12 rounded-[6px] bg-[color:var(--ed-action-bg)] text-[color:var(--ed-action-fg)] hover:bg-[color:var(--ed-action-bg)] hover:text-[color:var(--ed-action-fg)]"

  return (
    <div
      id="ed-root"
      data-ed-theme="light"
      className="grid min-h-screen text-[color:var(--ed-ink)] lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]"
      style={{ background: "var(--ed-canvas)" }}
    >
      <SystemThemeSync />
      <section className="relative flex min-h-screen items-center px-6 py-10 sm:px-10 lg:px-16">
        <div className="absolute right-6 top-6 sm:right-10 lg:right-16">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-[420px]">
          <a href="/" className="mb-20 inline-flex items-center" aria-label="subfrost home">
            <span className="relative block h-8 w-[148px]">
              <img
                src="/brand/subfrost/Logos/svg/logotype/logotype_dark.svg"
                alt="subfrost"
                className="ed-logo-light h-full w-auto"
              />
              <img
                src="/brand/subfrost/Logos/svg/logotype/logotype_light.svg"
                alt=""
                aria-hidden="true"
                className="ed-logo-dark absolute inset-0 h-full w-auto"
              />
            </span>
          </a>
          <div className="mb-9">
            <p className="mb-3 text-[15px] font-medium text-[color:var(--ed-muted)]">Admin</p>
            <h1 className="text-[48px] font-normal leading-none tracking-[-0.02em]">Sign in</h1>
            <p className="mt-5 max-w-[340px] text-[17px] leading-[1.5] text-[color:var(--ed-body)]">
              Manage articles, users, billing, and protocol operations from one private console.
            </p>
          </div>

          <div>
            {step === "credentials" ? (
              <form onSubmit={onSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-[color:var(--ed-body)]">Email</Label>
                  <Input id="email" type="email" autoComplete="username" value={email}
                    onChange={(e) => setEmail(e.target.value)} required className={inputCls} style={{ borderColor: "var(--ed-hair)" }} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-[color:var(--ed-body)]">Password</Label>
                  <Input id="password" type="password" autoComplete="current-password" value={password}
                    onChange={(e) => setPassword(e.target.value)} required className={inputCls} style={{ borderColor: "var(--ed-hair)" }} />
                </div>
                {error && <p className="text-sm text-[#b8321a]">{error}</p>}
                <Button type="submit" disabled={loading} className={`w-full ${buttonCls}`}>
                  {loading ? "Signing in..." : "Sign in"}
                </Button>
                <a href="/admin/forgot-password" className="inline-flex items-center gap-1 text-[14px] text-[color:var(--ed-muted)] hover:text-[color:var(--ed-ink)]">
                  Forgot password
                  <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} />
                </a>
              </form>
            ) : (
              <form onSubmit={onVerify} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="code" className="text-[color:var(--ed-body)]">
                    {useRecovery ? "Recovery code" : "Authenticator code"}
                  </Label>
                  <Input id="code" inputMode={useRecovery ? "text" : "numeric"} autoFocus autoComplete="one-time-code"
                    value={code} onChange={(e) => setCode(e.target.value)} required
                    placeholder={useRecovery ? "XXXXXXXX" : "123456"} className={`${inputCls} tracking-widest`} style={{ borderColor: "var(--ed-hair)" }} />
                </div>
                {error && <p className="text-sm text-[#b8321a]">{error}</p>}
                <Button type="submit" disabled={loading} className={`w-full ${buttonCls}`}>
                  {loading ? "Verifying..." : "Verify"}
                </Button>
                <button type="button" onClick={() => { setUseRecovery((v) => !v); setCode(""); setError(null) }}
                  className="text-[14px] text-[color:var(--ed-muted)] hover:text-[color:var(--ed-ink)]">
                  {useRecovery ? "Use an authenticator code instead" : "Use a recovery code instead"}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
      <aside className="relative hidden min-h-screen overflow-hidden lg:block">
        <Image
          src="/brand/subfrost/Graphics/jpeg/ice_bg.jpg"
          alt=""
          fill
          sizes="50vw"
          priority
          className="object-cover"
        />
      </aside>
    </div>
  )
}
