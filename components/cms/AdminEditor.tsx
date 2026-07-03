"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import type React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Markdown } from "@/lib/cms/markdown"
import {
  markdownToEditorHtml,
  editorDomToMarkdown,
  plainTextToEditorHtml,
  imageAltFromFile,
  escapeAttribute,
  escapeHtml,
} from "@/lib/cms/editor-markdown"
import { saveArticle, deleteArticle, translateArticleAction } from "@/actions/cms/articles"
import { Button } from "@/components/ui/button"
import {
  ArrowLeft,
  ArrowUpRight,
  Bold,
  Eye,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Languages,
  List,
  ListOrdered,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Pilcrow,
  Quote,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react"

type Status = "DRAFT" | "REVIEW" | "PUBLISHED" | "ARCHIVED"
type Locale = "en" | "zh"
interface LocaleContent { title: string; excerpt: string; body: string; sources?: string }
interface EditorMember { id: string; name: string | null }
interface RevisionSummary {
  id: string
  locale: Locale
  title: string
  createdAt: string
  editorName: string | null
  editorEmail: string | null
}

export interface EditorInitial {
  id?: string
  slug: string
  coverImage: string
  tags: string[]
  coAuthorIds?: string[]
  featured: boolean
  primaryLocale: Locale
  status: Status
  en: LocaleContent
  zh: LocaleContent
  author?: { name: string | null; email: string } | null
  publishedAt?: string | null
  updatedAt?: string | null
  revisions?: RevisionSummary[]
}

const LOCALE_LABEL: Record<Locale, string> = { en: "English", zh: "中文" }
const STATUS_COPY: Record<Status, string> = {
  DRAFT: "Draft",
  REVIEW: "In review",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
}

export function AdminEditor({
  initial,
  canPublish,
  members = [],
  translationEnabled = true,
}: {
  initial: EditorInitial
  canPublish: boolean
  members?: EditorMember[]
  translationEnabled?: boolean
}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const [uploading, setUploading] = useState(false)
  const [inlineUploading, setInlineUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeLocale, setActiveLocale] = useState<Locale>(initial.primaryLocale)
  const [tab, setTab] = useState<"write" | "preview">("write")
  const [settingsOpen, setSettingsOpen] = useState(true)

  const [content, setContent] = useState<Record<Locale, LocaleContent>>({ en: initial.en, zh: initial.zh })
  const [slug, setSlug] = useState(initial.slug)
  const [coverImage, setCoverImage] = useState(initial.coverImage)
  const [tags, setTags] = useState(initial.tags.join(", "))
  const [coAuthorIds, setCoAuthorIds] = useState<string[]>(initial.coAuthorIds ?? [])
  const [featured, setFeatured] = useState(initial.featured)
  const [primaryLocale, setPrimaryLocale] = useState<Locale>(initial.primaryLocale)

  const cur = content[activeLocale]
  const otherLocale: Locale = activeLocale === "en" ? "zh" : "en"
  const canTranslate = translationEnabled && Boolean(initial.id) && cur.title.trim().length > 0
  const wordCount = cur.body.trim() ? cur.body.trim().split(/\s+/).length : 0
  const hasUnsavedShape = initial.status !== "PUBLISHED" ? STATUS_COPY[initial.status] : "Published"
  const publicHref = slug ? `/articles/${slug}` : null

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault()
        submit(initial.status === "PUBLISHED" && canPublish ? "PUBLISHED" : "DRAFT")
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
    // submit intentionally reads current editor state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPublish, initial.status, slug, coverImage, tags, featured, primaryLocale, content])

  function setCur(patch: Partial<LocaleContent>) {
    setContent((c) => ({ ...c, [activeLocale]: { ...c[activeLocale], ...patch } }))
  }

  function editorInput(status: Status) {
    return {
      id: initial.id,
      slug: slug || undefined,
      coverImage,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      coAuthorIds,
      featured,
      primaryLocale,
      status,
      translations: {
        en: content.en.title.trim() ? content.en : undefined,
        zh: content.zh.title.trim() ? content.zh : undefined,
      },
    }
  }

  function submit(status: Status) {
    setError(null)
    startTransition(async () => {
      const res = await saveArticle(editorInput(status))
      if (res.ok) {
        router.push("/admin/articles")
        router.refresh()
      } else {
        setError(res.error)
      }
    })
  }

  // Human-triggered AI translation: persist the source locale so the newest text
  // is what gets translated, then run the existing Claude-backed action and drop
  // the result into the other language's tab (still a draft until you save).
  function translateActive(to: Locale) {
    const from = activeLocale
    if (!initial.id || from === to) return
    setError(null)
    startTransition(async () => {
      const saved = await saveArticle(editorInput(initial.status))
      if (!saved.ok) {
        setError(saved.error)
        return
      }
      const res = await translateArticleAction(saved.id, from, to)
      if (!res.ok) {
        setError(res.unavailable ? "Translation isn't configured yet (ANTHROPIC_API_KEY)." : res.error)
        return
      }
      setContent((c) => ({
        ...c,
        [to]: {
          title: res.translation.title,
          excerpt: res.translation.excerpt,
          body: res.translation.body,
          sources: res.translation.sources,
        },
      }))
      setActiveLocale(to)
    })
  }

  function onDelete() {
    if (!initial.id || !confirm("Delete this article? This cannot be undone.")) return
    startTransition(async () => {
      const res = await deleteArticle(initial.id!)
      if (res.ok) {
        router.push("/admin/articles")
        router.refresh()
      } else {
        setError(res.error)
      }
    })
  }

  async function uploadImageFile(file: File, kind: "cover" | "inline") {
    setError(null)
    if (kind === "cover") setUploading(true)
    else setInlineUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("kind", kind)
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd })
      const data = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !data.url) throw new Error(data.error || "Upload failed")
      return data.url
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed")
      return null
    } finally {
      if (kind === "cover") setUploading(false)
      else setInlineUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  async function uploadCover(file: File) {
    const url = await uploadImageFile(file, "cover")
    if (url) setCoverImage(url)
  }

  return (
    <div className="-mx-5 -my-8 min-h-screen bg-[color:var(--ed-canvas)] text-[color:var(--ed-ink)] md:-mx-8 lg:-mx-12 lg:-my-12">
      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-[color:var(--ed-hair)] bg-[color:var(--ed-canvas)]/95 px-5 backdrop-blur md:px-7 lg:px-10">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/admin/articles"
            className="inline-flex items-center gap-2 whitespace-nowrap text-sm text-[color:var(--ed-body)] transition-colors hover:text-[color:var(--ed-ink)]"
          >
            <ArrowLeft size={15} />
            Articles
          </Link>
          <span className="hidden text-sm text-[color:var(--ed-muted)] sm:inline">{hasUnsavedShape}</span>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setTab((v) => (v === "preview" ? "write" : "preview"))}
            className={`hidden h-9 items-center gap-2 rounded-[6px] px-3 text-sm text-[color:var(--ed-body)] transition-colors hover:bg-[color:var(--ed-surface)] hover:text-[color:var(--ed-ink)] md:inline-flex ${
              tab === "preview" ? "bg-[color:var(--ed-surface)] text-[color:var(--ed-ink)]" : ""
            }`}
          >
            <Eye size={15} />
            Preview
          </button>
          <button
            type="button"
            onClick={() => submit("DRAFT")}
            disabled={pending}
            className="hidden h-9 items-center whitespace-nowrap rounded-[6px] px-3 text-sm text-[color:var(--ed-body)] transition-colors hover:bg-[color:var(--ed-surface)] hover:text-[color:var(--ed-ink)] disabled:opacity-45 lg:inline-flex"
          >
            Save draft
          </button>
          {canPublish ? (
            <Button
              type="button"
              onClick={() => submit("PUBLISHED")}
              disabled={pending}
              size="sm"
              className="min-w-[104px]"
            >
              Publish
              <ArrowUpRight size={14} strokeWidth={2.3} />
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => submit("REVIEW")}
              disabled={pending}
              size="sm"
              className="min-w-[104px]"
            >
              Review
              <ArrowUpRight size={14} strokeWidth={2.3} />
            </Button>
          )}
          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-[6px] text-[color:var(--ed-body)] transition-colors hover:bg-[color:var(--ed-surface)] hover:text-[color:var(--ed-ink)]"
            aria-label={settingsOpen ? "Close article settings" : "Open article settings"}
          >
            {settingsOpen ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}
          </button>
        </div>
      </header>

      <div className={`grid min-h-[calc(100vh-4rem)] ${settingsOpen ? "lg:grid-cols-[minmax(0,1fr)_360px]" : ""}`}>
        <main className="ed-admin-reveal min-w-0 px-5 py-10 md:px-8 lg:px-10">
          <article className="mx-auto max-w-[820px]">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void uploadCover(file)
              }}
            />

            <FeatureImage
              image={coverImage}
              uploading={uploading}
              onPick={() => fileRef.current?.click()}
              onClear={() => setCoverImage("")}
              onFile={(file) => void uploadCover(file)}
            />

            <div className="mt-10 flex flex-wrap items-center gap-2">
              {(["en", "zh"] as Locale[]).map((loc) => (
                <button
                  key={loc}
                  type="button"
                  onClick={() => setActiveLocale(loc)}
                  className={`inline-flex h-8 items-center gap-2 rounded-[6px] px-3 text-sm transition-colors ${
                    activeLocale === loc
                      ? "bg-[color:var(--ed-ink)] text-[color:var(--ed-canvas)]"
                      : "text-[color:var(--ed-muted)] hover:text-[color:var(--ed-ink)]"
                  }`}
                >
                  {LOCALE_LABEL[loc]}
                  {content[loc].title.trim() && <span className="h-1.5 w-1.5 rounded-full bg-[#1ea463]" />}
                </button>
              ))}
              {canTranslate && (
                <button
                  type="button"
                  onClick={() => translateActive(otherLocale)}
                  disabled={pending}
                  title={`Translate the ${LOCALE_LABEL[activeLocale]} draft into ${LOCALE_LABEL[otherLocale]} with AI`}
                  className="ml-auto inline-flex h-8 items-center gap-2 rounded-[6px] border border-[color:var(--ed-hair)] px-3 text-sm text-[color:var(--ed-body)] transition-colors hover:bg-[color:var(--ed-surface)] hover:text-[color:var(--ed-ink)] disabled:opacity-45"
                >
                  <Languages size={14} />
                  {pending ? "Translating..." : `Translate to ${LOCALE_LABEL[otherLocale]}`}
                </button>
              )}
            </div>

            <label className="sr-only" htmlFor="post-title">Article title</label>
            <textarea
              id="post-title"
              value={cur.title}
              onChange={(e) => setCur({ title: e.target.value })}
              rows={3}
              placeholder="Article title"
              className="mt-7 block min-h-[17rem] w-full resize-none overflow-hidden bg-transparent text-[46px] font-semibold leading-[1.05] text-[color:var(--ed-ink)] outline-none placeholder:text-[color:var(--ed-muted)] sm:min-h-[13rem] sm:text-[64px]"
            />

            <label className="sr-only" htmlFor="post-excerpt">Article excerpt</label>
            <textarea
              id="post-excerpt"
              value={cur.excerpt}
              onChange={(e) => setCur({ excerpt: e.target.value })}
              rows={2}
              placeholder="Excerpt"
              className="mt-4 block min-h-[8.5rem] w-full resize-none overflow-hidden bg-transparent text-[22px] leading-[1.45] text-[color:var(--ed-body)] outline-none placeholder:text-[color:var(--ed-muted)] sm:min-h-[4.5rem]"
            />

            <div className="mt-10 border-t border-[color:var(--ed-hair)] pt-8">
              <div className="mb-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTab("write")}
                  className={`inline-flex h-8 items-center gap-2 rounded-[6px] px-3 text-sm ${tab === "write" ? "bg-[color:var(--ed-surface)] text-[color:var(--ed-ink)]" : "text-[color:var(--ed-muted)]"}`}
                >
                  <Pencil size={14} /> Write
                </button>
                <button
                  type="button"
                  onClick={() => setTab("preview")}
                  className={`inline-flex h-8 items-center gap-2 rounded-[6px] px-3 text-sm ${tab === "preview" ? "bg-[color:var(--ed-surface)] text-[color:var(--ed-ink)]" : "text-[color:var(--ed-muted)]"}`}
                >
                  <Eye size={14} /> Preview
                </button>
              </div>
              {tab === "write" ? (
                <GhostBodyEditor
                  value={cur.body}
                  onChange={(body) => setCur({ body })}
                  uploading={inlineUploading}
                  uploadImage={(file) => uploadImageFile(file, "inline")}
                />
              ) : (
                <div className="min-h-[52vh] bg-[color:var(--ed-canvas)] py-2">
                  {cur.body.trim() ? (
                    <Markdown variant="article">{cur.body}</Markdown>
                  ) : (
                    <p className="text-[color:var(--ed-muted)]">Nothing to preview.</p>
                  )}
                </div>
              )}
            </div>

            <div className="mt-8 flex items-center justify-between border-t border-[color:var(--ed-hair)] py-5 text-sm text-[color:var(--ed-muted)]">
              <span>{wordCount.toLocaleString()} {wordCount === 1 ? "word" : "words"}</span>
              {error && <span className="text-[#b8321a]">{error}</span>}
            </div>
          </article>
        </main>

        {settingsOpen && (
          <PostSettings
            canPublish={canPublish}
            initial={initial}
            publicHref={publicHref}
            slug={slug}
            setSlug={setSlug}
            primaryLocale={primaryLocale}
            setPrimaryLocale={setPrimaryLocale}
            tags={tags}
            setTags={setTags}
            members={members}
            coAuthorIds={coAuthorIds}
            setCoAuthorIds={setCoAuthorIds}
            coverImage={coverImage}
            setCoverImage={setCoverImage}
            featured={featured}
            setFeatured={setFeatured}
            pending={pending}
            submit={submit}
            onDelete={onDelete}
            onPickCover={() => fileRef.current?.click()}
          />
        )}
      </div>
    </div>
  )
}

function GhostBodyEditor({
  value,
  onChange,
  uploading,
  uploadImage,
}: {
  value: string
  onChange: (value: string) => void
  uploading: boolean
  uploadImage: (file: File) => Promise<string | null>
}) {
  const editorRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const lastMarkdownRef = useRef<string>("")

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || value === lastMarkdownRef.current) return
    editor.innerHTML = markdownToEditorHtml(value)
    lastMarkdownRef.current = value
  }, [value])

  function syncFromDom() {
    const editor = editorRef.current
    if (!editor) return
    const next = editorDomToMarkdown(editor)
    lastMarkdownRef.current = next
    onChange(next)
  }

  function focusEditor() {
    editorRef.current?.focus()
  }

  function runCommand(command: string, valueArg?: string) {
    focusEditor()
    document.execCommand(command, false, valueArg)
    syncFromDom()
  }

  function insertHtml(html: string) {
    focusEditor()
    document.execCommand("insertHTML", false, html)
    syncFromDom()
  }

  async function insertImage(file: File) {
    const url = await uploadImage(file)
    if (!url) return
    const alt = imageAltFromFile(file)
    insertHtml(`<figure data-md-image="true"><img src="${escapeAttribute(url)}" alt="${escapeAttribute(alt)}"><figcaption>${escapeHtml(alt)}</figcaption></figure><p><br></p>`)
  }

  async function onPaste(event: React.ClipboardEvent<HTMLDivElement>) {
    const image = Array.from(event.clipboardData.files).find((file) => file.type.startsWith("image/"))
    if (image) {
      event.preventDefault()
      await insertImage(image)
      return
    }

    const text = event.clipboardData.getData("text/plain")
    if (!text) return
    event.preventDefault()
    insertHtml(plainTextToEditorHtml(text))
  }

  async function onDrop(event: React.DragEvent<HTMLDivElement>) {
    const image = Array.from(event.dataTransfer.files).find((file) => file.type.startsWith("image/"))
    if (!image) return
    event.preventDefault()
    await insertImage(image)
  }

  return (
    <div className="rounded-[8px]">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void insertImage(file)
          event.currentTarget.value = ""
        }}
      />

      <div className="mb-5 flex flex-wrap items-center gap-1.5 border-b border-[color:var(--ed-hair)] pb-3">
        <EditorTool label="Paragraph" onClick={() => runCommand("formatBlock", "p")}><Pilcrow size={14} /></EditorTool>
        <EditorTool label="Heading 2" onClick={() => runCommand("formatBlock", "h2")}><Heading2 size={15} /></EditorTool>
        <EditorTool label="Heading 3" onClick={() => runCommand("formatBlock", "h3")}><Heading3 size={15} /></EditorTool>
        <span className="mx-1 h-5 w-px bg-[color:var(--ed-hair)]" />
        <EditorTool label="Bold" onClick={() => runCommand("bold")}><Bold size={14} /></EditorTool>
        <EditorTool label="Italic" onClick={() => runCommand("italic")}><Italic size={14} /></EditorTool>
        <EditorTool label="Quote" onClick={() => runCommand("formatBlock", "blockquote")}><Quote size={14} /></EditorTool>
        <EditorTool label="Bullet list" onClick={() => runCommand("insertUnorderedList")}><List size={15} /></EditorTool>
        <EditorTool label="Numbered list" onClick={() => runCommand("insertOrderedList")}><ListOrdered size={15} /></EditorTool>
        <span className="mx-1 h-5 w-px bg-[color:var(--ed-hair)]" />
        <EditorTool label={uploading ? "Uploading image" : "Add image"} onClick={() => fileInputRef.current?.click()} disabled={uploading}><ImagePlus size={15} /></EditorTool>
        {uploading && <span className="ml-2 text-xs text-[color:var(--ed-muted)]">Uploading image...</span>}
      </div>

      <div className="group/editor relative">
        {!value.trim() && (
          <div className="pointer-events-none absolute left-0 top-0 text-[20px] leading-[1.75] text-[color:var(--ed-muted)]">
            Begin writing your article...
          </div>
        )}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-label="Article body"
          spellCheck
          onInput={syncFromDom}
          onBlur={syncFromDom}
          onPaste={(event) => void onPaste(event)}
          onDrop={(event) => void onDrop(event)}
          onDragOver={(event) => event.preventDefault()}
          className="ghost-post-editor min-h-[52vh] w-full outline-none"
        />
      </div>
    </div>
  )
}

function EditorTool({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] text-[color:var(--ed-body)] transition-colors hover:bg-[color:var(--ed-surface)] hover:text-[color:var(--ed-ink)] disabled:pointer-events-none disabled:opacity-45"
    >
      {children}
    </button>
  )
}

function FeatureImage({
  image,
  uploading,
  onPick,
  onClear,
  onFile,
}: {
  image: string
  uploading: boolean
  onPick: () => void
  onClear: () => void
  onFile: (file: File) => void
}) {
  function onDrop(event: React.DragEvent<HTMLElement>) {
    const file = Array.from(event.dataTransfer.files).find((item) => item.type.startsWith("image/"))
    if (!file) return
    event.preventDefault()
    onFile(file)
  }

  if (image) {
    return (
      <figure
        className="group relative overflow-hidden rounded-[8px] bg-[color:var(--ed-surface)]"
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        <img src={image} alt="" className="aspect-[16/7] w-full object-cover" />
        <div className="absolute right-3 top-3 flex gap-2 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
          <button
            type="button"
            onClick={onPick}
            className="inline-flex h-8 items-center gap-2 rounded-[6px] bg-black/70 px-3 text-xs font-medium text-white backdrop-blur"
          >
            <Upload size={13} /> Replace
          </button>
          <button
            type="button"
            onClick={onClear}
            className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] bg-black/70 text-white backdrop-blur"
            aria-label="Remove feature image"
          >
            <X size={14} />
          </button>
        </div>
      </figure>
    )
  }

  return (
    <button
      type="button"
      onClick={onPick}
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
      disabled={uploading}
      className="mb-10 flex h-8 w-fit items-center gap-3 rounded-[6px] text-sm text-[color:var(--ed-muted)] transition-colors hover:text-[color:var(--ed-ink)] disabled:opacity-50"
    >
      <span className="inline-flex items-center gap-2">
        <ImagePlus size={15} />
        {uploading ? "Uploading feature image..." : "Add feature image"}
      </span>
      <Upload size={15} className="opacity-70" />
    </button>
  )
}

function PostSettings({
  canPublish,
  initial,
  publicHref,
  slug,
  setSlug,
  primaryLocale,
  setPrimaryLocale,
  tags,
  setTags,
  members,
  coAuthorIds,
  setCoAuthorIds,
  coverImage,
  setCoverImage,
  featured,
  setFeatured,
  pending,
  submit,
  onDelete,
  onPickCover,
}: {
  canPublish: boolean
  initial: EditorInitial
  publicHref: string | null
  slug: string
  setSlug: (value: string) => void
  primaryLocale: Locale
  setPrimaryLocale: (value: Locale) => void
  tags: string
  setTags: (value: string) => void
  members: EditorMember[]
  coAuthorIds: string[]
  setCoAuthorIds: (value: string[]) => void
  coverImage: string
  setCoverImage: (value: string) => void
  featured: boolean
  setFeatured: (value: boolean) => void
  pending: boolean
  submit: (status: Status) => void
  onDelete: () => void
  onPickCover: () => void
}) {
  return (
    <aside
      className="ed-admin-scroll ed-admin-reveal border-t border-[color:var(--ed-hair)] px-5 py-7 md:px-8 lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] lg:overflow-y-auto lg:border-t-0 lg:px-6 lg:shadow-[-24px_0_70px_rgba(7,17,31,0.04)]"
      style={{ animationDelay: "80ms" }}
    >
      <div className="mb-7 flex items-center justify-between">
        <h2 className="text-[18px] font-medium text-[color:var(--ed-ink)]">Article settings</h2>
        <span className="text-xs text-[color:var(--ed-muted)]">{STATUS_COPY[initial.status]}</span>
      </div>

      <div className="space-y-6">
        <SettingGroup label="Article URL">
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="auto-from-title"
            className="h-10 w-full rounded-[6px] border border-[color:var(--ed-hair)] bg-[color:var(--ed-surface)] px-3 text-sm text-[color:var(--ed-ink)] outline-none transition-colors placeholder:text-[color:var(--ed-muted)] focus:border-[color:var(--ed-muted)]"
          />
          <p className="mt-2 text-xs text-[color:var(--ed-muted)]">/articles/{slug || "article-slug"}</p>
          {publicHref && initial.status === "PUBLISHED" && (
            <Link href={publicHref} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm text-[color:var(--ed-body)] hover:text-[color:var(--ed-ink)]">
              View article <ArrowUpRight size={13} />
            </Link>
          )}
        </SettingGroup>

        <SettingGroup label="Publish date">
          <p className="text-sm text-[color:var(--ed-ink)]">
            {initial.publishedAt ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(initial.publishedAt)) : "Not published"}
          </p>
        </SettingGroup>

        <SettingGroup label="Author">
          <p className="truncate text-sm text-[color:var(--ed-ink)]">
            {initial.author?.name ?? initial.author?.email ?? "Current user"}
          </p>
        </SettingGroup>

        <SettingGroup label="Primary language">
          <div className="flex items-center gap-4">
            {(["en", "zh"] as Locale[]).map((locale) => (
              <button
                key={locale}
                type="button"
                onClick={() => setPrimaryLocale(locale)}
                className={`inline-flex items-center gap-2 text-sm transition-colors ${
                  primaryLocale === locale
                    ? "text-[color:var(--ed-ink)]"
                    : "text-[color:var(--ed-muted)] hover:text-[color:var(--ed-ink)]"
                }`}
              >
                {LOCALE_LABEL[locale]}
                {primaryLocale === locale && <span className="h-1.5 w-1.5 rounded-full bg-[#1ea463]" aria-hidden />}
              </button>
            ))}
          </div>
        </SettingGroup>

        <SettingGroup label="Tags">
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="Research, Alkanes"
            className="h-10 w-full rounded-[6px] border border-[color:var(--ed-hair)] bg-[color:var(--ed-surface)] px-3 text-sm text-[color:var(--ed-ink)] outline-none transition-colors placeholder:text-[color:var(--ed-muted)] focus:border-[color:var(--ed-muted)]"
          />
          <p className="mt-2 text-xs text-[color:var(--ed-muted)]">Comma-separated for now; tokenized tags come next.</p>
        </SettingGroup>

        {members.length > 0 && (
          <SettingGroup label="Co-authors">
            <div className="flex flex-wrap gap-2">
              {members.map((member) => {
                const active = coAuthorIds.includes(member.id)
                return (
                  <button
                    key={member.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      setCoAuthorIds(
                        active
                          ? coAuthorIds.filter((id) => id !== member.id)
                          : [...coAuthorIds, member.id],
                      )
                    }
                    className={`inline-flex h-8 items-center rounded-[6px] px-3 text-sm transition-colors ${
                      active
                        ? "bg-[color:var(--ed-ink)] text-[color:var(--ed-canvas)]"
                        : "bg-[color:var(--ed-surface)] text-[color:var(--ed-body)] hover:text-[color:var(--ed-ink)]"
                    }`}
                  >
                    {member.name ?? member.id}
                  </button>
                )
              })}
            </div>
          </SettingGroup>
        )}

        <SettingGroup label="Feature image">
          <div className="flex gap-2">
            <input
              value={coverImage}
              onChange={(e) => setCoverImage(e.target.value)}
              placeholder="https://..."
              className="h-10 min-w-0 flex-1 rounded-[6px] border border-[color:var(--ed-hair)] bg-[color:var(--ed-surface)] px-3 text-sm text-[color:var(--ed-ink)] outline-none transition-colors placeholder:text-[color:var(--ed-muted)] focus:border-[color:var(--ed-muted)]"
            />
            <Button
              type="button"
              onClick={onPickCover}
              variant="outline"
              size="icon"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[6px] border border-[color:var(--ed-hair)] text-[color:var(--ed-body)] transition-colors hover:text-[color:var(--ed-ink)]"
              aria-label="Upload feature image"
            >
              <Upload size={15} />
            </Button>
          </div>
        </SettingGroup>

        {canPublish && (
          <label className="flex items-center justify-between border-t border-[color:var(--ed-hair)] py-5 text-sm text-[color:var(--ed-ink)]">
            <span className="inline-flex items-center gap-2"><Star size={15} /> Feature this article</span>
            <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} className="h-4 w-4 accent-[color:var(--ed-ink)]" />
          </label>
        )}

        {initial.revisions && initial.revisions.length > 0 && (
          <SettingGroup label="Article history">
            <div className="space-y-3">
              {initial.revisions.slice(0, 5).map((revision) => (
                <div key={revision.id} className="border-t border-[color:var(--ed-hair)] pt-3 first:border-t-0 first:pt-0">
                  <div className="flex items-center justify-between gap-3 text-sm text-[color:var(--ed-ink)]">
                    <span className="truncate">{revision.title || "Untitled"}</span>
                    <span className="text-xs uppercase text-[color:var(--ed-muted)]">{revision.locale}</span>
                  </div>
                  <p className="mt-1 text-xs text-[color:var(--ed-muted)]">
                    {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(revision.createdAt))}
                    {revision.editorName || revision.editorEmail ? ` by ${revision.editorName ?? revision.editorEmail}` : ""}
                  </p>
                </div>
              ))}
            </div>
          </SettingGroup>
        )}

        <div className="border-t border-[color:var(--ed-hair)] pt-5">
          <div className="mb-3 text-sm font-medium text-[color:var(--ed-ink)]">Publishing</div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => submit("DRAFT")}
              disabled={pending}
              variant="outline"
              size="sm"
            >
              Save draft
            </Button>
            {canPublish ? (
              <Button
                type="button"
                onClick={() => submit("PUBLISHED")}
                disabled={pending}
                size="sm"
              >
                Publish
                <ArrowUpRight size={14} strokeWidth={2.3} />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => submit("REVIEW")}
                disabled={pending}
                size="sm"
              >
                Submit review
                <ArrowUpRight size={14} strokeWidth={2.3} />
              </Button>
            )}
          </div>
          {initial.status === "PUBLISHED" && canPublish && (
            <button type="button" onClick={() => submit("ARCHIVED")} disabled={pending} className="mt-3 inline-flex items-center gap-1 text-sm text-[color:var(--ed-body)] hover:text-[color:var(--ed-ink)]">
              Unpublish <ArrowUpRight size={13} />
            </button>
          )}
        </div>

        {initial.id && (
          <Button
            type="button"
            onClick={onDelete}
            disabled={pending}
            variant="destructive"
            className="w-full"
          >
            <Trash2 size={15} /> Delete article
          </Button>
        )}
      </div>
    </aside>
  )
}

function SettingGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-[color:var(--ed-body)]">
        {label}
      </label>
      {children}
    </div>
  )
}
