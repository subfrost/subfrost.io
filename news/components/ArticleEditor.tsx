"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Markdown } from "@/lib/markdown"
import { saveArticle, deleteArticle } from "@/actions/articles"
import { Eye, Pencil, Trash2 } from "lucide-react"

type Status = "DRAFT" | "REVIEW" | "PUBLISHED" | "ARCHIVED"

export interface EditorInitial {
  id?: string
  title: string
  slug: string
  excerpt: string
  body: string
  coverImage: string
  tags: string[]
  featured: boolean
  status: Status
}

export function ArticleEditor({
  initial,
  canPublish,
}: {
  initial: EditorInitial
  canPublish: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [tab, setTab] = useState<"write" | "preview">("write")
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState(initial.title)
  const [slug, setSlug] = useState(initial.slug)
  const [excerpt, setExcerpt] = useState(initial.excerpt)
  const [body, setBody] = useState(initial.body)
  const [coverImage, setCoverImage] = useState(initial.coverImage)
  const [tags, setTags] = useState(initial.tags.join(", "))
  const [featured, setFeatured] = useState(initial.featured)

  function submit(status: Status) {
    setError(null)
    startTransition(async () => {
      const res = await saveArticle({
        id: initial.id,
        title,
        slug: slug || undefined,
        excerpt,
        body,
        coverImage,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        featured,
        status,
      })
      if (res.ok) {
        router.push("/admin")
        router.refresh()
      } else {
        setError(res.error)
      }
    })
  }

  function onDelete() {
    if (!initial.id) return
    if (!confirm("Delete this article? This cannot be undone.")) return
    startTransition(async () => {
      const res = await deleteArticle(initial.id!)
      if (res.ok) {
        router.push("/admin")
        router.refresh()
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      {/* Main column */}
      <div className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Article title"
            className="text-lg"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="excerpt">Excerpt</Label>
          <Textarea
            id="excerpt"
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            placeholder="One or two sentences shown in previews and on subfrost.io"
            rows={2}
          />
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2">
            <Label>Body (Markdown)</Label>
            <div className="ml-auto flex rounded-md border border-zinc-800 p-0.5">
              <button
                type="button"
                onClick={() => setTab("write")}
                className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${
                  tab === "write" ? "bg-zinc-800 text-white" : "text-zinc-400"
                }`}
              >
                <Pencil size={12} /> Write
              </button>
              <button
                type="button"
                onClick={() => setTab("preview")}
                className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${
                  tab === "preview" ? "bg-zinc-800 text-white" : "text-zinc-400"
                }`}
              >
                <Eye size={12} /> Preview
              </button>
            </div>
          </div>

          {tab === "write" ? (
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="# Heading&#10;&#10;Write your article in Markdown…"
              rows={26}
              className="font-mono text-sm leading-relaxed"
            />
          ) : (
            <div className="min-h-[40rem] rounded-md border border-zinc-800 bg-zinc-900/40 p-6">
              {body.trim() ? (
                <Markdown>{body}</Markdown>
              ) : (
                <p className="text-zinc-600">Nothing to preview yet.</p>
              )}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      {/* Sidebar */}
      <aside className="space-y-5">
        <div className="space-y-3 rounded-xl border border-zinc-800 bg-card/40 p-4">
          <div className="text-sm font-medium text-zinc-300">Publish</div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => submit("DRAFT")} disabled={pending}>
              Save draft
            </Button>
            {canPublish ? (
              <Button size="sm" onClick={() => submit("PUBLISHED")} disabled={pending}>
                Publish
              </Button>
            ) : (
              <Button size="sm" onClick={() => submit("REVIEW")} disabled={pending}>
                Submit for review
              </Button>
            )}
          </div>
          {initial.status === "PUBLISHED" && canPublish && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => submit("ARCHIVED")}
              disabled={pending}
            >
              Unpublish (archive)
            </Button>
          )}
          <div className="text-xs text-zinc-500">
            Current status: <span className="text-zinc-300">{initial.status}</span>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-zinc-800 bg-card/40 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="auto-generated from title"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tags">Tags (comma-separated)</Label>
            <Input
              id="tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="frBTC, Research"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cover">Cover image URL</Label>
            <Input
              id="cover"
              value={coverImage}
              onChange={(e) => setCoverImage(e.target.value)}
              placeholder="https://…"
            />
          </div>
          {canPublish && (
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={featured}
                onChange={(e) => setFeatured(e.target.checked)}
                className="h-4 w-4 accent-brand-blue"
              />
              Feature on subfrost.io homepage
            </label>
          )}
        </div>

        {initial.id && (
          <Button
            size="sm"
            variant="destructive"
            onClick={onDelete}
            disabled={pending}
            className="w-full"
          >
            <Trash2 size={14} /> Delete article
          </Button>
        )}
      </aside>
    </div>
  )
}
