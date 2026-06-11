"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import FrostBackdrop from "@/components/FrostBackdrop"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { doLogin } from "@/actions/auth"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const res = await doLogin(email, password)
    if (res.ok) {
      router.push("/admin")
      router.refresh()
    } else {
      setError(res.error)
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <FrostBackdrop count={60} />
      <form
        onSubmit={onSubmit}
        className="relative w-full max-w-sm rounded-2xl border border-zinc-800 bg-card/80 p-8 backdrop-blur"
      >
        <div className="mb-6 text-center">
          <div className="text-xl font-bold responsive-shadow">SUBFROST</div>
          <div className="text-xs uppercase tracking-widest text-zinc-500">News Admin</div>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </div>
      </form>
    </div>
  )
}
