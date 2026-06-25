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
import { ArrowLeft, Eye, ImagePlus, Italic, LinkIcon, MessageSquare, PanelRight, Pencil, Quote, Trash2, Upload } from "lucide-react"

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

type ToolbarState = { visible: boolean; x: number; y: number }
type SelectionPatch = { text: string; start: number; end: number }

function markerPosition(textarea: HTMLTextAreaElement, index: number) {
  const style = window.getComputedStyle(textarea)
  const mirror = document.createElement("div")
  const marker = document.createElement("span")
  const properties = [
    "boxSizing",
    "width",
    "fontFamily",
    "fontSize",
    "fontWeight",
    "letterSpacing",
    "lineHeight",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
    "tabSize",
  ] as const

  mirror.style.position = "absolute"
  mirror.style.visibility = "hidden"
  mirror.style.pointerEvents = "none"
  mirror.style.left = `${textarea.getBoundingClientRect().left + window.scrollX}px`
  mirror.style.top = `${textarea.getBoundingClientRect().top + window.scrollY}px`
  mirror.style.whiteSpace = "pre-wrap"
  mirror.style.overflowWrap = "break-word"
  mirror.style.overflow = "hidden"
  properties.forEach((property) => {
    mirror.style[property] = style[property]
  })

  mirror.textContent = textarea.value.slice(0, index)
  marker.textContent = textarea.value.slice(index, index + 1) || "."
  mirror.appendChild(marker)
  document.body.appendChild(mirror)
  const textareaRect = textarea.getBoundingClientRect()
  const markerRect = marker.getBoundingClientRect()
  document.body.removeChild(mirror)

  return {
    x: markerRect.left - textareaRect.left - textarea.scrollLeft,
    y: markerRect.top - textareaRect.top - textarea.scrollTop,
  }
}

function blockPrefixPatch(body: string, start: number, end: number, prefix: string): SelectionPatch {
  const lineStart = body.lastIndexOf("\n", Math.max(0, start - 1)) + 1
  const lineEndMatch = body.indexOf("\n", end)
  const lineEnd = lineEndMatch === -1 ? body.length : lineEndMatch
  const selectedBlock = body.slice(lineStart, lineEnd)
  const replacement = selectedBlock
    .split("\n")
    .map((line) => (line.startsWith(prefix) ? line : `${prefix}${line}`))
    .join("\n")

  return { text: body.slice(0, lineStart) + replacement + body.slice(lineEnd), start: lineStart, end: lineStart + replacement.length }
}

export function AdminEditor({ initial, canPublish, canTranslate }: { initial: EditorInitial; canPublish: boolean; canTranslate?: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [translating, setTranslating] = useState(false)
  const [activeLocale, setActiveLocale] = useState<Locale>(initial.primaryLocale)
  const [tab, setTab] = useState<"write" | "preview">("write")
  const [settingsOpen, setSettingsOpen] = useState(true)
  const [toolbar, setToolbar] = useState<ToolbarState>({ visible: false, x: 0, y: 0 })

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
  const toolbarRef = useRef<HTMLDivElement>(null)
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

  function updateSelectionToolbar() {
    const el = bodyRef.current
    if (!el || document.activeElement !== el || el.selectionStart === el.selectionEnd) {
      setToolbar((state) => (state.visible ? { ...state, visible: false } : state))
      return
    }

    const point = markerPosition(el, el.selectionStart)
    const rect = el.getBoundingClientRect()
    const width = toolbarRef.current?.offsetWidth ?? 294
    const x = Math.min(Math.max(rect.left + point.x, 12), window.innerWidth - width - 12)
    const y = Math.max(rect.top + point.y - 56, 12)
    setToolbar({ visible: true, x, y })
  }

  function applySelectionPatch(format: "bold" | "italic" | "h2" | "h3" | "quote" | "link" | "comment") {
    const el = bodyRef.current
    if (!el || el.selectionStart === el.selectionEnd) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const body = cur.body
    const selected = body.slice(start, end)
    let patch: SelectionPatch

    if (format === "bold") {
      patch = { text: `${body.slice(0, start)}**${selected}**${body.slice(end)}`, start: start + 2, end: end + 2 }
    } else if (format === "italic") {
      patch = { text: `${body.slice(0, start)}*${selected}*${body.slice(end)}`, start: start + 1, end: end + 1 }
    } else if (format === "h2") {
      patch = blockPrefixPatch(body, start, end, "## ")
    } else if (format === "h3") {
      patch = blockPrefixPatch(body, start, end, "### ")
    } else if (format === "quote") {
      patch = blockPrefixPatch(body, start, end, "> ")
    } else if (format === "link") {
      const replacement = `[${selected}](https://)`
      patch = { text: `${body.slice(0, start)}${replacement}${body.slice(end)}`, start: start + selected.length + 3, end: start + selected.length + 11 }
    } else {
      const replacement = `<!-- ${selected} -->`
      patch = { text: `${body.slice(0, start)}${replacement}${body.slice(end)}`, start: start + 5, end: start + 5 + selected.length }
    }

    setCur({ body: patch.text })
    requestAnimationFrame(() => {
      bodyRef.current?.focus()
      bodyRef.current?.setSelectionRange(patch.start, patch.end)
      updateSelectionToolbar()
    })
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
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-white/10 bg-black/95 px-4 backdrop-blur md:gap-5 md:px-8">
        <Link href="/admin/articles" className="inline-flex items-center gap-2 text-sm text-zinc-300 transition-colors hover:text-white">
          <ArrowLeft size={15} />
          Articles
        </Link>
        <span className="hidden text-sm text-zinc-500 sm:inline">{initial.status === "DRAFT" ? "Draft" : initial.status.charAt(0) + initial.status.slice(1).toLowerCase()}</span>
        <div className="ml-auto flex items-center gap-4 md:gap-8">
          {initial.id ? (
            <Link href={`/admin/articles/${initial.id}/preview`} target="_blank" className="text-sm font-medium text-zinc-100 transition-colors hover:text-white">
              Preview
            </Link>
          ) : (
            <span className="text-sm font-medium text-zinc-600">Preview</span>
          )}
          <button type="button" onClick={() => submit("DRAFT")} disabled={pending || uploads > 0 || coverUploading} className="hidden text-sm font-medium text-zinc-400 transition-colors hover:text-white disabled:opacity-40 sm:inline">
            Save draft
          </button>
          {canPublish ? (
            <button
              type="button"
              onClick={() => submit("PUBLISHED")}
              disabled={pending || uploads > 0 || coverUploading}
              className="text-sm font-semibold text-[#a7c6dc] transition-colors hover:text-[#e9f0f7] disabled:opacity-40"
            >
              Publish
            </button>
          ) : (
            <button
              type="button"
              onClick={() => submit("REVIEW")}
              disabled={pending || uploads > 0 || coverUploading}
              className="text-sm font-semibold text-[#a7c6dc] transition-colors hover:text-[#e9f0f7] disabled:opacity-40"
            >
              Submit for review
            </button>
          )}
          <button
            type="button"
            onClick={() => setSettingsOpen((open) => !open)}
            aria-pressed={settingsOpen}
            aria-label={settingsOpen ? "Hide article settings" : "Show article settings"}
            className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
          >
            <PanelRight size={17} strokeWidth={1.8} />
          </button>
        </div>
      </header>

      <div className={`grid min-h-[calc(100vh-3.5rem)] transition-[grid-template-columns] duration-300 ${settingsOpen ? "lg:grid-cols-[minmax(0,1fr)_380px]" : "lg:grid-cols-[minmax(0,1fr)_0px]"}`}>
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
              <>
                <div
                  ref={toolbarRef}
                  data-cms-format-toolbar
                  className={`fixed z-50 flex h-10 items-center overflow-hidden rounded-[7px] bg-[#272c32] text-white shadow-[0_18px_32px_rgba(0,0,0,0.28)] transition-[opacity,transform] duration-150 ${
                    toolbar.visible ? "pointer-events-auto scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0"
                  }`}
                  style={{ left: toolbar.x, top: toolbar.y }}
                  onMouseDown={(event) => event.preventDefault()}
                  aria-hidden={!toolbar.visible}
                >
                  {[
                    { key: "bold", label: "Bold", node: <span className="font-serif text-[22px] font-semibold leading-none">B</span> },
                    { key: "italic", label: "Italic", node: <Italic size={21} strokeWidth={1.9} /> },
                    { key: "h2", label: "Heading", node: <span className="font-serif text-[22px] leading-none">H</span> },
                    { key: "h3", label: "Subheading", node: <span className="font-serif text-[16px] leading-none">H</span> },
                    { key: "quote", label: "Quote", node: <Quote size={21} strokeWidth={1.9} /> },
                    { key: "link", label: "Link", node: <LinkIcon size={20} strokeWidth={2} /> },
                    { key: "comment", label: "Comment", node: <MessageSquare size={19} strokeWidth={1.9} /> },
                  ].map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      aria-label={item.label}
                      onClick={() => applySelectionPatch(item.key as "bold" | "italic" | "h2" | "h3" | "quote" | "link" | "comment")}
                      className="flex h-10 w-10 items-center justify-center border-r border-white/10 text-white transition-colors last:border-r-0 hover:bg-white/10"
                    >
                      {item.node}
                    </button>
                  ))}
                </div>
                <Textarea
                  ref={bodyRef}
                  value={cur.body}
                  onChange={(e) => setCur({ body: e.target.value })}
                  rows={24}
                  onPaste={onBodyPaste}
                  onDrop={onBodyDrop}
                  onSelect={updateSelectionToolbar}
                  onMouseUp={updateSelectionToolbar}
                  onKeyUp={updateSelectionToolbar}
                  onScroll={updateSelectionToolbar}
                  onBlur={(event) => {
                    if (toolbarRef.current?.contains(event.relatedTarget as Node | null)) return
                    setToolbar((state) => ({ ...state, visible: false }))
                  }}
                  placeholder="Start writing..."
                  className="mt-8 min-h-[42rem] resize-none border-0 bg-transparent p-0 text-xl leading-[1.65] text-zinc-100 shadow-none outline-none placeholder:text-zinc-700 focus-visible:ring-0"
                />
              </>
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

        <aside className={`${settingsOpen ? "block opacity-100 lg:border-l lg:px-6" : "hidden opacity-0 lg:block lg:overflow-hidden lg:border-l-0 lg:px-0"} border-t border-white/10 bg-black px-5 py-8 transition-opacity duration-300 lg:border-t-0 ${settingsOpen ? "" : "pointer-events-none"}`}>
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
                    onClick={() => {
                      setPrimaryLocale(loc)
                      setActiveLocale(loc)
                    }}
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

            {initial.id && (
              <div className="space-y-3 border-t border-white/10 pt-6">
                {initial.status === "PUBLISHED" && canPublish && (
                  <button type="button" onClick={() => submit("ARCHIVED")} disabled={pending || uploads > 0 || coverUploading} className="text-sm text-zinc-400 transition-colors hover:text-white disabled:opacity-40">
                    Unpublish
                  </button>
                )}
                <button
                  type="button"
                  onClick={onTranslate}
                  disabled={pending || translating || !canTranslate}
                  title={canTranslate ? "Translate the current language into the other with Claude" : "Claude translation isn't configured"}
                  className="block text-sm text-zinc-400 transition-colors hover:text-white disabled:opacity-40"
                >
                  {translating ? "Translating..." : `Translate ${activeLocale === "en" ? "EN -> 中文" : "中文 -> EN"}`}
                </button>
              </div>
            )}

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
