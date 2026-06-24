"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Image from "next/image"
import { ArrowUpRight } from "lucide-react"
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

  const inputCls =
    "h-12 rounded-[6px] border-[#d9e3ec] bg-white text-[#07111f] placeholder:text-[#8a9bab] focus-visible:ring-[#a7c6dc]"
  const buttonCls =
    "h-12 rounded-[6px] bg-[#07111f] text-white hover:bg-[#07111f] hover:text-white"

  return (
    <div className="grid min-h-screen bg-[#f7fafc] text-[#07111f] lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
      <section className="flex min-h-screen items-center px-6 py-10 sm:px-10 lg:px-16">
        <div className="w-full max-w-[420px]">
          <a href="/" className="mb-20 inline-flex items-center" aria-label="subfrost home">
            <Image
              src="/brand/subfrost/Logos/svg/logotype/logotype_black.svg"
              width={156}
              height={32}
              alt="subfrost"
              priority
              className="h-8 w-auto"
            />
          </a>
          <div className="mb-9">
            <p className="mb-3 text-[15px] font-medium text-[#5f7690]">Admin</p>
            <h1 className="text-[48px] font-normal leading-none tracking-[-0.02em]">Sign in</h1>
            <p className="mt-5 max-w-[340px] text-[17px] leading-[1.5] text-[#455a72]">
              Manage articles, users, billing, and protocol operations from one private console.
            </p>
          </div>

          <div>
            {step === "credentials" ? (
              <form onSubmit={onSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-[#455a72]">Email</Label>
                  <Input id="email" type="email" autoComplete="username" value={email}
                    onChange={(e) => setEmail(e.target.value)} required className={inputCls} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-[#455a72]">Password</Label>
                  <Input id="password" type="password" autoComplete="current-password" value={password}
                    onChange={(e) => setPassword(e.target.value)} required className={inputCls} />
                </div>
                {error && <p className="text-sm text-[#b8321a]">{error}</p>}
                <Button type="submit" disabled={loading} className={`w-full ${buttonCls}`}>
                  {loading ? "Signing in..." : "Sign in"}
                </Button>
                <a href="/admin/forgot-password" className="inline-flex items-center gap-1 text-[14px] text-[#5f7690]">
                  Forgot password
                  <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} />
                </a>
              </form>
            ) : (
              <form onSubmit={onVerify} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="code" className="text-[#455a72]">
                    {useRecovery ? "Recovery code" : "Authenticator code"}
                  </Label>
                  <Input id="code" inputMode={useRecovery ? "text" : "numeric"} autoFocus autoComplete="one-time-code"
                    value={code} onChange={(e) => setCode(e.target.value)} required
                    placeholder={useRecovery ? "XXXXXXXX" : "123456"} className={`${inputCls} tracking-widest`} />
                </div>
                {error && <p className="text-sm text-[#b8321a]">{error}</p>}
                <Button type="submit" disabled={loading} className={`w-full ${buttonCls}`}>
                  {loading ? "Verifying..." : "Verify"}
                </Button>
                <button type="button" onClick={() => { setUseRecovery((v) => !v); setCode(""); setError(null) }}
                  className="text-[14px] text-[#5f7690]">
                  {useRecovery ? "Use an authenticator code instead" : "Use a recovery code instead"}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
      <aside className="hidden min-h-screen overflow-hidden bg-[#07111f] p-8 lg:block">
        <div className="relative h-full overflow-hidden rounded-[6px]">
          <Image
            src="/brand/subfrost/Graphics/jpeg/ice_bg.jpg"
            alt=""
            fill
            sizes="50vw"
            priority
            className="object-cover"
          />
          <div className="absolute inset-0 bg-[#07111f]/25" />
        </div>
      </aside>
    </div>
  )
}
