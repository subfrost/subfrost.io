"use client"

import { useState, useTransition, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Markdown } from "@/lib/cms/markdown"
import { insertAtCursor, replaceFirst } from "@/lib/cms/markdown-insert"
import { uploadInlineImage } from "@/lib/cms/inline-image-upload"
import { saveArticle, deleteArticle, translateArticleAction } from "@/actions/cms/articles"
import { ArrowLeft, ArrowUpRight, Eye, ImagePlus, Pencil, Trash2, Upload } from "lucide-react"

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

  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const coverFileRef = useRef<HTMLInputElement>(null)
  const [uploads, setUploads] = useState(0)
  const [coverUploading, setCoverUploading] = useState(false)

  function imageFilesFrom(items: DataTransferItemList | null, files: FileList | null): File[] {
    const out: File[] = []
    if (items) {
      for (const it of Array.from(items)) {
        if (it.kind === "file" && it.type.startsWith("image/")) {
          const f = it.getAsFile()
          if (f) out.push(f)
        }
      }
    }
    if (out.length === 0 && files) {
      for (const f of Array.from(files)) if (f.type.startsWith("image/")) out.push(f)
    }
    return out
  }

  async function uploadFileIntoBody(file: File, atCursor: boolean) {
    const token = `![uploading…](#upload-${Date.now()}-${Math.random().toString(36).slice(2, 7)})`
    // Insert placeholder via a functional update so concurrent uploads don't clobber.
    setContent((c) => {
      const body = c[activeLocale].body
      if (atCursor) {
        const el = bodyRef.current
        const start = el?.selectionStart ?? body.length
        const end = el?.selectionEnd ?? body.length
        return { ...c, [activeLocale]: { ...c[activeLocale], body: insertAtCursor(body, start, end, token).text } }
      }
      const sep = body.length === 0 || body.endsWith("\n") ? "" : "\n"
      return { ...c, [activeLocale]: { ...c[activeLocale], body: body + sep + token } }
    })
    setUploads((n) => n + 1)
    try {
      const url = await uploadInlineImage(file)
      setContent((c) => ({ ...c, [activeLocale]: { ...c[activeLocale], body: replaceFirst(c[activeLocale].body, token, `![](${url})`) } }))
    } catch (e) {
      setContent((c) => ({ ...c, [activeLocale]: { ...c[activeLocale], body: replaceFirst(c[activeLocale].body, token, "") } }))
      setError(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setUploads((n) => n - 1)
    }
  }

  async function uploadFilesIntoBody(files: File[]) {
    for (let i = 0; i < files.length; i++) await uploadFileIntoBody(files[i], i === 0)
  }

  function onBodyPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const imgs = imageFilesFrom(e.clipboardData.items, e.clipboardData.files)
    if (imgs.length === 0) return
    e.preventDefault()
    void uploadFilesIntoBody(imgs)
  }

  function onBodyDrop(e: React.DragEvent<HTMLTextAreaElement>) {
    const imgs = imageFilesFrom(e.dataTransfer.items, e.dataTransfer.files)
    if (imgs.length === 0) return
    e.preventDefault()
    void uploadFilesIntoBody(imgs)
  }

  async function uploadCoverFile(file: File) {
    setError(null)
    setCoverUploading(true)
    try {
      const url = await uploadInlineImage(file)
      setCoverImage(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cover image upload failed")
    } finally {
      setCoverUploading(false)
    }
  }

  function onCoverFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    void uploadCoverFile(file)
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
    <div className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-white/10 bg-black/95 px-5 backdrop-blur md:px-8">
        <Link href="/admin/articles" className="inline-flex items-center gap-2 text-sm text-zinc-300 transition-colors hover:text-white">
          <ArrowLeft size={15} />
          Articles
        </Link>
        <span className="text-sm text-zinc-500">{initial.status === "DRAFT" ? "Draft" : initial.status.charAt(0) + initial.status.slice(1).toLowerCase()}</span>
        <div className="ml-auto flex items-center gap-4">
          {initial.id && (
            <Link href={`/admin/articles/${initial.id}/preview`} target="_blank" className="inline-flex items-center gap-2 text-sm text-zinc-300 transition-colors hover:text-white">
              <Eye size={15} />
              Preview
            </Link>
          )}
          <button type="button" onClick={() => submit("DRAFT")} disabled={pending || uploads > 0 || coverUploading} className="text-sm text-zinc-300 transition-colors hover:text-white disabled:opacity-40">
            Save draft
          </button>
          {canPublish ? (
            <button
              type="button"
              onClick={() => submit("PUBLISHED")}
              disabled={pending || uploads > 0 || coverUploading}
              className="inline-flex h-10 items-center gap-2 rounded-[6px] bg-[#e9f0f7] px-4 text-sm font-medium text-[#212121] transition-colors hover:bg-white disabled:opacity-40"
            >
              Publish
              <ArrowUpRight size={15} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => submit("REVIEW")}
              disabled={pending || uploads > 0 || coverUploading}
              className="inline-flex h-10 items-center gap-2 rounded-[6px] bg-[#e9f0f7] px-4 text-sm font-medium text-[#212121] transition-colors hover:bg-white disabled:opacity-40"
            >
              Submit for review
              <ArrowUpRight size={15} />
            </button>
          )}
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-3.5rem)] lg:grid-cols-[minmax(0,1fr)_380px]">
        <main className="min-w-0 px-5 py-10 md:px-10 lg:px-16">
          <div className="mx-auto max-w-[820px]">
            <input ref={coverFileRef} type="file" accept="image/*" className="hidden" onChange={onCoverFileChange} />

            {coverImage ? (
              <div className="group mb-10 overflow-hidden rounded-[8px] border border-white/10 bg-zinc-950">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={coverImage} alt="" className="aspect-[16/7] w-full object-cover" />
                <div className="flex items-center justify-between border-t border-white/10 px-4 py-3">
                  <button type="button" onClick={() => coverFileRef.current?.click()} className="inline-flex items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-white">
                    <Upload size={15} />
                    {coverUploading ? "Uploading feature image..." : "Replace feature image"}
                  </button>
                  <button type="button" onClick={() => setCoverImage("")} className="text-sm text-zinc-500 transition-colors hover:text-white">
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => coverFileRef.current?.click()}
                disabled={coverUploading}
                className="mb-10 inline-flex h-8 items-center gap-3 rounded-[6px] text-sm text-zinc-500 transition-colors hover:text-zinc-200 disabled:opacity-50"
              >
                <span className="inline-flex items-center gap-2">
                  <ImagePlus size={15} />
                  {coverUploading ? "Uploading feature image..." : "Add feature image"}
                </span>
                <Upload size={15} className="opacity-70" />
              </button>
            )}

            <div className="mb-8 flex items-center gap-5">
              {(["en", "zh"] as Locale[]).map((loc) => (
                <button
                  key={loc}
                  type="button"
                  onClick={() => setActiveLocale(loc)}
                  className={`inline-flex items-center gap-2 text-sm transition-colors ${
                    activeLocale === loc ? "text-white" : "text-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  {LOCALE_LABEL[loc]}
                  {content[loc].title.trim() && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />}
                </button>
              ))}
            </div>

            <input
              value={cur.title}
              onChange={(e) => setCur({ title: e.target.value })}
              placeholder="Article title"
              className="mb-6 w-full resize-none bg-transparent text-[clamp(3rem,7vw,4.75rem)] font-semibold leading-[0.98] tracking-normal text-white outline-none placeholder:text-zinc-700"
            />

            <Textarea
              value={cur.excerpt}
              onChange={(e) => setCur({ excerpt: e.target.value })}
              rows={2}
              placeholder="Add an excerpt"
              className="mb-12 min-h-20 resize-none border-0 bg-transparent p-0 text-2xl leading-snug text-zinc-300 shadow-none outline-none placeholder:text-zinc-700 focus-visible:ring-0"
            />

            <div className="border-y border-white/10 py-3">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setTab("write")} className={`inline-flex items-center gap-2 rounded-[6px] px-3 py-2 text-sm transition-colors ${tab === "write" ? "bg-white/5 text-white" : "text-zinc-500 hover:text-white"}`}>
                  <Pencil size={14} /> Write
                </button>
                <button type="button" onClick={() => setTab("preview")} className={`inline-flex items-center gap-2 rounded-[6px] px-3 py-2 text-sm transition-colors ${tab === "preview" ? "bg-white/5 text-white" : "text-zinc-500 hover:text-white"}`}>
                  <Eye size={14} /> Preview
                </button>
              </div>
            </div>

            {tab === "write" ? (
              <Textarea
                ref={bodyRef}
                value={cur.body}
                onChange={(e) => setCur({ body: e.target.value })}
                rows={24}
                onPaste={onBodyPaste}
                onDrop={onBodyDrop}
                placeholder="Start writing..."
                className="mt-8 min-h-[42rem] resize-none border-0 bg-transparent p-0 text-xl leading-[1.65] text-zinc-100 shadow-none outline-none placeholder:text-zinc-700 focus-visible:ring-0"
              />
            ) : (
              <div className="mt-8 min-h-[42rem] rounded-[8px] bg-white p-8 text-zinc-950">
                {cur.body.trim() ? <Markdown variant="article">{cur.body}</Markdown> : <p className="text-zinc-400">Nothing to preview.</p>}
              </div>
            )}
            {uploads > 0 && <p className="mt-3 text-xs text-[#a7c6dc]">Uploading image...</p>}

            <div className="mt-10 border-t border-white/10 pt-8">
              <Label className="text-sm text-zinc-400">Sources</Label>
              <Textarea
                value={cur.sources}
                onChange={(e) => setCur({ sources: e.target.value })}
                rows={3}
                placeholder="Optional Markdown sources shown at the end of the article"
                className="mt-3 resize-none border-white/10 bg-transparent font-mono text-sm text-zinc-200 placeholder:text-zinc-700 focus-visible:ring-[#a7c6dc]"
              />
            </div>

            {error && <p className="mt-5 text-sm text-red-400">{error}</p>}
          </div>
        </main>

        <aside className="border-t border-white/10 bg-black px-5 py-8 lg:border-l lg:border-t-0 lg:px-6">
          <div className="sticky top-20 space-y-7">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-medium text-white">Article settings</h2>
              <span className="text-sm text-zinc-500">{initial.status === "PUBLISHED" ? "Published" : initial.status === "DRAFT" ? "Draft" : initial.status}</span>
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-zinc-300">Article URL</Label>
              <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="auto from title" className="border-white/10 bg-transparent text-zinc-100" />
              {slug && <p className="text-xs text-zinc-500">/articles/{slug}</p>}
            </div>

            <div className="space-y-3">
              <Label className="text-sm text-zinc-300">Primary language</Label>
              <div className="flex items-center gap-5">
                {(["en", "zh"] as Locale[]).map((loc) => (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => setPrimaryLocale(loc)}
                    className={`inline-flex items-center gap-2 text-sm transition-colors ${
                      primaryLocale === loc ? "text-white" : "text-zinc-500 hover:text-zinc-200"
                    }`}
                  >
                    {LOCALE_LABEL[loc]}
                    {primaryLocale === loc && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-zinc-300">Tags</Label>
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="frBTC, Research" className="border-white/10 bg-transparent text-zinc-100" />
              <p className="text-xs text-zinc-600">Comma-separated for now.</p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-zinc-300">Feature image URL</Label>
              <div className="flex gap-2">
                <Input value={coverImage} onChange={(e) => setCoverImage(e.target.value)} placeholder="https://..." className="border-white/10 bg-transparent text-zinc-100" />
                <button type="button" onClick={() => coverFileRef.current?.click()} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[6px] border border-white/10 text-zinc-400 transition-colors hover:border-white/25 hover:text-white" aria-label="Upload feature image">
                  <Upload size={16} />
                </button>
              </div>
            </div>

            {canPublish && (
              <label className="flex items-center gap-3 border-y border-white/10 py-5 text-sm text-zinc-300">
                <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} className="h-4 w-4 accent-[#e9f0f7]" />
                Feature this article
              </label>
            )}

            <div className="space-y-3 border-t border-white/10 pt-6">
              <div className="text-sm text-zinc-300">Publishing</div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => submit("DRAFT")} disabled={pending || uploads > 0 || coverUploading} className="border-white/10 bg-transparent text-zinc-100 hover:bg-white/5">
                  Save draft
                </Button>
                {canPublish ? (
                  <Button size="sm" onClick={() => submit("PUBLISHED")} disabled={pending || uploads > 0 || coverUploading} className="bg-[#e9f0f7] text-[#212121] hover:bg-white">
                    Publish <ArrowUpRight size={14} />
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => submit("REVIEW")} disabled={pending || uploads > 0 || coverUploading} className="bg-[#e9f0f7] text-[#212121] hover:bg-white">
                    Submit <ArrowUpRight size={14} />
                  </Button>
                )}
              </div>
              {initial.status === "PUBLISHED" && canPublish && (
                <button type="button" onClick={() => submit("ARCHIVED")} disabled={pending || uploads > 0 || coverUploading} className="text-sm text-zinc-400 transition-colors hover:text-white disabled:opacity-40">
                  Unpublish <ArrowUpRight size={13} className="inline" />
                </button>
              )}
              {initial.id && (
                <button
                  type="button"
                  onClick={onTranslate}
                  disabled={pending || translating || !canTranslate}
                  title={canTranslate ? "Translate the current language into the other with Claude" : "Claude translation isn't configured"}
                  className="block text-sm text-zinc-400 transition-colors hover:text-white disabled:opacity-40"
                >
                  {translating ? "Translating..." : `Translate ${activeLocale === "en" ? "EN -> 中文" : "中文 -> EN"}`}
                </button>
              )}
            </div>

            {initial.id && (
              <Button size="sm" variant="destructive" onClick={onDelete} disabled={pending} className="w-full bg-[#ec4521] text-white hover:bg-[#ec4521]/90">
                <Trash2 size={14} /> Delete article
              </Button>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
