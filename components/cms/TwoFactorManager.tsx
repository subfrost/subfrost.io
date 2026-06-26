"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { setupTotp, verifyTotp, disableTotp } from "@/actions/cms/totp"

type Stage = "idle" | "setup" | "recovery" | "disable"

export function TwoFactorManager({ enabled, recoveryRemaining }: { enabled: boolean; recoveryRemaining: number }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [stage, setStage] = useState<Stage>("idle")
  const [qr, setQr] = useState("")
  const [secret, setSecret] = useState("")
  const [code, setCode] = useState("")
  const [codes, setCodes] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  function begin() {
    setError(null)
    startTransition(async () => {
      const res = await setupTotp()
      if (res.ok) { setQr(res.qrCodeDataUri); setSecret(res.secret); setStage("setup") }
      else setError(res.error)
    })
  }

  function confirm() {
    setError(null)
    startTransition(async () => {
      const res = await verifyTotp(code)
      if (res.ok) { setCodes(res.recoveryCodes); setCode(""); setStage("recovery") }
      else setError(res.error)
    })
  }

  function disable() {
    setError(null)
    startTransition(async () => {
      const res = await disableTotp(code)
      if (res.ok) { setCode(""); setStage("idle"); router.refresh() }
      else setError(res.error)
    })
  }

  const cls = "border-[color:var(--ed-hair)] bg-[color:var(--ed-surface)] text-[color:var(--ed-ink)] tracking-widest"

  return (
    <div className="space-y-4 border-t border-[color:var(--ed-hair)] pt-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-[color:var(--ed-ink)]">Two-factor authentication</div>
          <div className="text-xs text-[color:var(--ed-muted)]">
            {enabled ? `Enabled · ${recoveryRemaining} recovery codes left` : "Add a TOTP authenticator app for extra security"}
          </div>
        </div>
        {stage === "idle" && (
          enabled
            ? <Button size="sm" variant="ghost" className="text-[#b8321a]" onClick={() => { setError(null); setStage("disable") }}>Disable</Button>
            : <Button size="sm" disabled={pending} onClick={begin}>Enable 2FA</Button>
        )}
      </div>

      {stage === "setup" && (
        <div className="space-y-3 border-t border-[color:var(--ed-hair)] pt-4">
          <p className="text-xs text-[color:var(--ed-body)]">Scan with your authenticator app, then enter the 6-digit code.</p>
          {qr && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="TOTP QR code" className="h-44 w-44 rounded-[6px] bg-white p-2" />
          )}
          <p className="text-xs text-[color:var(--ed-muted)]">Or enter this secret manually: <code className="text-[color:var(--ed-ink)]">{secret}</code></p>
          <Input inputMode="numeric" autoComplete="one-time-code" placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} className={cls} />
          {error && <p className="text-sm text-[#b8321a]">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" disabled={pending || code.length < 6} onClick={confirm}>Verify &amp; enable</Button>
            <Button size="sm" variant="ghost" onClick={() => { setStage("idle"); setCode(""); setError(null) }}>Cancel</Button>
          </div>
        </div>
      )}

      {stage === "recovery" && (
        <div className="space-y-3 border-t border-[color:var(--ed-hair)] pt-4">
          <p className="text-sm text-[#1ea463]">Two-factor is on. Save these recovery codes somewhere safe; each works once and they will not be shown again.</p>
          <div className="grid grid-cols-2 gap-2 rounded-[6px] border border-[color:var(--ed-hair)] bg-[color:var(--ed-surface)] p-3 font-mono text-sm text-[color:var(--ed-ink)]">
            {codes.map((c) => <span key={c}>{c}</span>)}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(codes.join("\n"))}>Copy codes</Button>
            <Button size="sm" onClick={() => { setStage("idle"); router.refresh() }}>Done</Button>
          </div>
        </div>
      )}

      {stage === "disable" && (
        <div className="space-y-3 border-t border-[color:var(--ed-hair)] pt-4">
          <p className="text-xs text-[color:var(--ed-body)]">Enter a current authenticator code or a recovery code to turn off 2FA.</p>
          <Input autoComplete="one-time-code" placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} className={cls} />
          {error && <p className="text-sm text-[#b8321a]">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" className="text-[#b8321a]" disabled={pending || !code} onClick={disable}>Disable 2FA</Button>
            <Button size="sm" variant="ghost" onClick={() => { setStage("idle"); setCode(""); setError(null) }}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  )
}
