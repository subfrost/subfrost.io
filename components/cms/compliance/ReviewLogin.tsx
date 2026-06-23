"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { reviewLoginAction } from "@/actions/cms/reviews"

export function ReviewLogin({ token }: { token: string }) {
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    startTransition(async () => {
      setError(null)
      const res = await reviewLoginAction(token, password)
      if (res.ok) {
        // Server component re-reads the cookie and renders the dashboard.
        window.location.reload()
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <div className="mx-auto mt-24 max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
      <h1 className="text-xl font-bold text-white">Compliance review access</h1>
      <p className="mt-1 text-sm text-zinc-500">Enter the password you were given to view the shared compliance materials.</p>
      <form
        className="mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="border-zinc-700 bg-zinc-900 text-zinc-100"
          autoFocus
        />
        {error && <div className="rounded-lg bg-red-950/40 p-2 text-sm text-red-300">{error}</div>}
        <Button type="submit" disabled={pending || !password} className="w-full">
          {pending ? "Checking…" : "Enter"}
        </Button>
      </form>
    </div>
  )
}
