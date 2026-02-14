"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { BroadcastControls } from "@/components/stream/BroadcastControls"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Radio } from "lucide-react"

function BroadcastPageContent() {
  const searchParams = useSearchParams()
  const [streamKey, setStreamKey] = useState("")
  const [isKeySet, setIsKeySet] = useState(false)

  // Pre-fill from URL search params
  useEffect(() => {
    const keyParam = searchParams.get("key")
    if (keyParam) {
      setStreamKey(keyParam)
    }
  }, [searchParams])

  function handleStart() {
    if (streamKey.trim()) {
      setIsKeySet(true)
    }
  }

  if (!isKeySet) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4">
        <Card className="w-full max-w-md border-zinc-800 bg-zinc-900">
          <CardHeader className="text-center">
            <CardTitle className="text-xl text-white">
              Broadcast Studio
            </CardTitle>
            <p className="text-sm text-zinc-400">
              Enter your stream key to begin broadcasting.
            </p>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleStart()
              }}
              className="space-y-4"
            >
              <Input
                type="text"
                placeholder="Stream key"
                value={streamKey}
                onChange={(e) => setStreamKey(e.target.value)}
                className="border-zinc-700 bg-zinc-800 text-white placeholder:text-zinc-500"
                autoFocus
              />
              <Button
                type="submit"
                className="w-full"
                disabled={!streamKey.trim()}
              >
                <Radio className="h-4 w-4" />
                Start
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950">
      {/* Title bar */}
      <header className="flex items-center border-b border-zinc-800 px-6 py-3">
        <h1 className="text-lg font-semibold text-white">Broadcast Studio</h1>
      </header>

      {/* Controls and previews */}
      <main className="flex-1 p-6">
        <BroadcastControls streamKey={streamKey} className="border-zinc-800 bg-zinc-900" />
      </main>
    </div>
  )
}

export default function BroadcastPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-950">
          <p className="text-zinc-400">Loading...</p>
        </div>
      }
    >
      <BroadcastPageContent />
    </Suspense>
  )
}
