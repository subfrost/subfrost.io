"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Markdown } from "@/lib/cms/markdown"
import { saveArticle, deleteArticle, translateArticleAction } from "@/actions/cms/articles"
import { Eye, Pencil, Trash2 } from "lucide-react"

type Status = "DRAFT" | "REVIEW" | "PUBLISHED" | "ARCHIVED"
type Locale = "en" | "zh"
interface LocaleContent { title: string; excerpt: string; body: string; sources: string }

export interface EditorInitial {
  id?: string
  slug: string
  coverImage: string
  tags: string[]
  featured: boolean
  primaryLocale: Locale
  status: Status
  en: LocaleContent
  zh: LocaleContent
}

const LOCALE_LABEL: Record<Locale, string> = { en: "English", zh: "中文" }

export function AdminEditor({ initial, canPublish, canTranslate }: { initial: EditorInitial; canPublish: boolean; canTranslate?: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [translating, setTranslating] = useState(false)
  const [activeLocale, setActiveLocale] = useState<Locale>(initial.primaryLocale)
  const [tab, setTab] = useState<"write" | "preview">("write")

  const [content, setContent] = useState<Record<Locale, LocaleContent>>({ en: initial.en, zh: initial.zh })
  const [slug, setSlug] = useState(initial.slug)
  const [coverImage, setCoverImage] = useState(initial.coverImage)
  const [tags, setTags] = useState(initial.tags.join(", "))
  const [featured, setFeatured] = useState(initial.featured)
  const [primaryLocale, setPrimaryLocale] = useState<Locale>(initial.primaryLocale)

  const cur = content[activeLocale]
  function setCur(patch: Partial<LocaleContent>) {
    setContent((c) => ({ ...c, [activeLocale]: { ...c[activeLocale], ...patch } }))
  }

  function submit(status: Status) {
    setError(null)
    startTransition(async () => {
      const res = await saveArticle({
        id: initial.id,
        slug: slug || undefined,
        coverImage,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        featured,
        primaryLocale,
        status,
        translations: {
          en: content.en.title.trim() ? content.en : undefined,
          zh: content.zh.title.trim() ? content.zh : undefined,
        },
      })
      if (res.ok) { router.push("/admin/articles"); router.refresh() } else setError(res.error)
    })
  }

  function onTranslate() {
    if (!initial.id) return
    const from = activeLocale
    const to: Locale = from === "en" ? "zh" : "en"
    if (content[to].title.trim() && !confirm(`Overwrite the ${LOCALE_LABEL[to]} translation with a new Claude translation?`)) return
    setError(null); setTranslating(true)
    translateArticleAction(initial.id, from, to)
      .then((res) => {
        if (res.ok) setContent((c) => ({ ...c, [to]: res.translation }))
        else setError(res.error)
      })
      .finally(() => setTranslating(false))
  }

  function onDelete() {
    if (!initial.id || !confirm("Delete this article? This cannot be undone.")) return
    startTransition(async () => {
      const res = await deleteArticle(initial.id!)
      if (res.ok) { router.push("/admin/articles"); router.refresh() } else setError(res.error)
    })
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        {/* Locale switcher */}
        <div className="flex gap-1 rounded-lg border border-zinc-800 p-1">
          {(["en", "zh"] as Locale[]).map((loc) => (
            <button key={loc} type="button" onClick={() => setActiveLocale(loc)}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm ${activeLocale === loc ? "bg-zinc-800 text-white" : "text-zinc-400"}`}>
              {LOCALE_LABEL[loc]}
              {content[loc].title.trim() && <span className="ml-1.5 text-emerald-400">●</span>}
            </button>
          ))}
        </div>

        <div className="space-y-1.5">
          <Label className="text-zinc-300">Title ({LOCALE_LABEL[activeLocale]})</Label>
          <Input value={cur.title} onChange={(e) => setCur({ title: e.target.value })}
            placeholder="Article title" className="bg-zinc-900 text-lg text-zinc-100 border-zinc-700" />
        </div>

        <div className="space-y-1.5">
          <Label className="text-zinc-300">Excerpt</Label>
          <Textarea value={cur.excerpt} onChange={(e) => setCur({ excerpt: e.target.value })} rows={2}
            placeholder="Shown in previews and on the homepage" className="bg-zinc-900 text-zinc-100 border-zinc-700" />
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2">
            <Label className="text-zinc-300">Body (Markdown)</Label>
            <div className="ml-auto flex rounded-md border border-zinc-800 p-0.5">
              <button type="button" onClick={() => setTab("write")} className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${tab === "write" ? "bg-zinc-800 text-white" : "text-zinc-400"}`}><Pencil size={12} /> Write</button>
              <button type="button" onClick={() => setTab("preview")} className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${tab === "preview" ? "bg-zinc-800 text-white" : "text-zinc-400"}`}><Eye size={12} /> Preview</button>
            </div>
          </div>
          {tab === "write" ? (
            <Textarea value={cur.body} onChange={(e) => setCur({ body: e.target.value })} rows={24}
              placeholder="# Heading&#10;&#10;Write in Markdown…" className="bg-zinc-900 font-mono text-sm text-zinc-100 border-zinc-700" />
          ) : (
            <div className="min-h-[36rem] rounded-md border border-zinc-800 bg-white p-6">
              {cur.body.trim() ? <Markdown variant="article">{cur.body}</Markdown> : <p className="text-zinc-400">Nothing to preview.</p>}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-zinc-300">Sources (Markdown · optional)</Label>
          <Textarea value={cur.sources} onChange={(e) => setCur({ sources: e.target.value })} rows={3}
            placeholder="e.g. Bitcoin Block Space Weekly, Issue #29 — shown as a separate section at the end"
            className="bg-zinc-900 font-mono text-sm text-zinc-100 border-zinc-700" />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      <aside className="space-y-5">
        <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="text-sm font-medium text-zinc-300">Publish</div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => submit("DRAFT")} disabled={pending}>Save draft</Button>
            {canPublish
              ? <Button size="sm" onClick={() => submit("PUBLISHED")} disabled={pending}>Publish</Button>
              : <Button size="sm" onClick={() => submit("REVIEW")} disabled={pending}>Submit for review</Button>}
          </div>
          {initial.status === "PUBLISHED" && canPublish && (
            <Button size="sm" variant="ghost" onClick={() => submit("ARCHIVED")} disabled={pending}>Unpublish</Button>
          )}
          {initial.id && (
            <Button size="sm" variant="outline" onClick={onTranslate}
              disabled={pending || translating || !canTranslate}
              title={canTranslate ? "Translate the current language into the other with Claude" : "Claude translation isn't configured"}>
              {translating ? "Translating…" : `Translate ${activeLocale === "en" ? "EN→中文" : "中文→EN"} with Claude`}
            </Button>
          )}
          <div className="text-xs text-zinc-500">Status: <span className="text-zinc-300">{initial.status}</span></div>
        </div>

        <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Slug</Label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="auto from title" className="bg-zinc-900 text-zinc-100 border-zinc-700" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Primary language</Label>
            <select value={primaryLocale} onChange={(e) => setPrimaryLocale(e.target.value as Locale)}
              className="flex h-10 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100">
              <option value="en">English</option>
              <option value="zh">中文</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Tags (comma-separated)</Label>
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="frBTC, Research" className="bg-zinc-900 text-zinc-100 border-zinc-700" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Cover image URL</Label>
            <Input value={coverImage} onChange={(e) => setCoverImage(e.target.value)} placeholder="https://…" className="bg-zinc-900 text-zinc-100 border-zinc-700" />
          </div>
          {canPublish && (
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} className="h-4 w-4" />
              Feature on homepage
            </label>
          )}
        </div>

        {initial.id && (
          <Button size="sm" variant="destructive" onClick={onDelete} disabled={pending} className="w-full">
            <Trash2 size={14} /> Delete article
          </Button>
        )}
      </aside>
    </div>
  )
}
