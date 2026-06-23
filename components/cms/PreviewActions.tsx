"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { publishArticleAction } from "@/actions/cms/articles"

/** The single publish button on the article preview. Keeps the slug shown in the
 *  preview; non-publishers submit for review (downgrade handled server-side). */
export function PreviewActions({ id, slug, canPublish }: { id: string; slug: string; canPublish: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function go() {
    setError(null)
    startTransition(async () => {
      const res = await publishArticleAction(id)
      if (res.ok) router.push(`/articles/${res.slug}`)
      else setError(res.error)
    })
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-zinc-500">/articles/{slug}</span>
      {error && <span className="text-sm text-red-400">{error}</span>}
      <Button size="sm" onClick={go} disabled={pending}>
        {pending ? "Working…" : canPublish ? "Publish" : "Submit for review"}
      </Button>
    </div>
  )
}
