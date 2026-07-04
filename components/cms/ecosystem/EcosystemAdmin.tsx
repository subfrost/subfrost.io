"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Boxes, Plus, Pencil, Trash2 } from "lucide-react"
import {
  saveEcosystemProject,
  deleteEcosystemProject,
  setFeaturedBandEnabled,
  translateEcosystemDescription,
  type EcosystemProjectInput,
} from "@/actions/ecosystem/projects"
import { ECOSYSTEM_CATEGORIES, ECOSYSTEM_STATUSES } from "@/lib/ecosystem/constants"

export interface AdminProject {
  id: string
  slug: string
  name: string
  logoUrl: string | null
  category: string
  status: string
  url: string
  xUrl: string | null
  docsUrl: string | null
  descriptionEn: string
  descriptionZh: string
  featured: boolean
  sortOrder: number
  published: boolean
  createdAt: string
  updatedAt: string
}

const inputCls = "rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-sky-500 focus:outline-none"
const selectCls = "rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-sky-500 focus:outline-none"
const label = "text-[11px] font-medium uppercase tracking-wide text-zinc-500"

function blankProject(): AdminProject {
  return {
    id: "",
    slug: "",
    name: "",
    logoUrl: null,
    category: ECOSYSTEM_CATEGORIES[0],
    status: ECOSYSTEM_STATUSES[0],
    url: "",
    xUrl: null,
    docsUrl: null,
    descriptionEn: "",
    descriptionZh: "",
    featured: false,
    sortOrder: 0,
    published: false,
    createdAt: "",
    updatedAt: "",
  }
}

export function EcosystemAdmin({ projects, featuredBandEnabled, canEdit }: {
  projects: AdminProject[]
  featuredBandEnabled: boolean
  canEdit: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState<AdminProject | "new" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [band, setBand] = useState(featuredBandEnabled)

  function toggleBand() {
    const next = !band
    setBand(next)
    setError(null)
    startTransition(async () => {
      const res = await setFeaturedBandEnabled(next)
      if (res.ok) router.refresh()
      else { setBand(!next); setError(res.error ?? "Failed to update featured band") }
    })
  }

  function onDelete(p: AdminProject) {
    if (!window.confirm(`Delete "${p.name}"? This cannot be undone.`)) return
    setError(null)
    startTransition(async () => {
      const res = await deleteEcosystemProject(p.id)
      if (res.ok) router.refresh()
      else setError(res.error ?? "Delete failed")
    })
  }

  function togglePublished(p: AdminProject) {
    setError(null)
    startTransition(async () => {
      const res = await saveEcosystemProject(toInput({ ...p, published: !p.published }))
      if (res.ok) router.refresh()
      else setError(res.error ?? "Save failed")
    })
  }

  function toggleFeatured(p: AdminProject) {
    setError(null)
    startTransition(async () => {
      const res = await saveEcosystemProject(toInput({ ...p, featured: !p.featured }))
      if (res.ok) router.refresh()
      else setError(res.error ?? "Save failed")
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-white">
          <Boxes size={20} className="text-zinc-400" /> Ecosystem projects
        </h1>
        {canEdit && (
          <button
            onClick={() => setEditing("new")}
            className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800"
          >
            <Plus size={16} /> New project
          </button>
        )}
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-zinc-200">Featured band</p>
            <p className="text-xs text-zinc-500">
              Shows a highlighted row of featured projects at the top of the public /ecosystem page.
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={band}
              disabled={!canEdit || pending}
              onChange={toggleBand}
              aria-label="Enable featured band"
              className="h-4 w-8 cursor-pointer appearance-none rounded-full bg-zinc-700 outline-none transition-colors checked:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <span className="text-xs text-zinc-400">{band ? "Enabled" : "Disabled"}</span>
          </label>
        </div>
      </div>

      {error && <p className="rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-sm text-rose-300">{error}</p>}

      {editing !== null && canEdit && (
        <ProjectForm
          initial={editing === "new" ? blankProject() : editing}
          isNew={editing === "new"}
          onCancel={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh() }}
          onError={setError}
        />
      )}

      <div className="overflow-hidden rounded-lg border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/60 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Featured</th>
              <th className="px-3 py-2 font-medium">Published</th>
              {canEdit && <th className="px-3 py-2 font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id} className="border-t border-zinc-800">
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2 text-zinc-100">
                    {p.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.logoUrl} alt="" className="h-5 w-5 shrink-0 rounded object-cover" />
                    ) : (
                      <span className="h-5 w-5 shrink-0 rounded bg-zinc-800" />
                    )}
                    {p.name}
                  </span>
                </td>
                <td className="px-3 py-2 text-zinc-300">{p.category}</td>
                <td className="px-3 py-2 text-zinc-300">{p.status}</td>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={p.featured}
                    disabled={!canEdit || pending}
                    onChange={() => toggleFeatured(p)}
                    aria-label={`Featured: ${p.name}`}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={p.published}
                    disabled={!canEdit || pending}
                    onChange={() => togglePublished(p)}
                    aria-label={`Published: ${p.name}`}
                  />
                </td>
                {canEdit && (
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditing(p)}
                        aria-label={`Edit ${p.name}`}
                        title="Edit"
                        className="text-zinc-500 hover:text-zinc-200"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => onDelete(p)}
                        aria-label={`Delete ${p.name}`}
                        title="Delete"
                        className="text-zinc-500 hover:text-rose-400"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {projects.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 6 : 5} className="px-3 py-8 text-center text-sm text-zinc-600">
                  No ecosystem projects yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function toInput(p: AdminProject): EcosystemProjectInput {
  return {
    id: p.id || undefined,
    name: p.name,
    slug: p.slug || undefined,
    logoUrl: p.logoUrl,
    category: p.category,
    status: p.status,
    url: p.url,
    xUrl: p.xUrl,
    docsUrl: p.docsUrl,
    descriptionEn: p.descriptionEn,
    descriptionZh: p.descriptionZh,
    featured: p.featured,
    sortOrder: p.sortOrder,
    published: p.published,
  }
}

function ProjectForm({ initial, isNew, onCancel, onSaved, onError }: {
  initial: AdminProject
  isNew: boolean
  onCancel: () => void
  onSaved: () => void
  onError: (e: string | null) => void
}) {
  const [pending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [translating, setTranslating] = useState(false)

  const [name, setName] = useState(initial.name)
  const [slug, setSlug] = useState(initial.slug)
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl ?? "")
  const [category, setCategory] = useState(initial.category)
  const [status, setStatus] = useState(initial.status)
  const [url, setUrl] = useState(initial.url)
  const [xUrl, setXUrl] = useState(initial.xUrl ?? "")
  const [docsUrl, setDocsUrl] = useState(initial.docsUrl ?? "")
  const [descriptionEn, setDescriptionEn] = useState(initial.descriptionEn)
  const [descriptionZh, setDescriptionZh] = useState(initial.descriptionZh)
  const [featured, setFeatured] = useState(initial.featured)
  const [sortOrder, setSortOrder] = useState(initial.sortOrder)
  const [published, setPublished] = useState(initial.published)

  async function onPickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); onError(null)
    const fd = new FormData()
    fd.append("file", file)
    fd.append("kind", "ecosystem")
    const res = await fetch("/api/admin/upload", { method: "POST", body: fd })
    const json = await res.json()
    setUploading(false)
    if (res.ok) setLogoUrl(json.url)
    else onError(json.error || "Upload failed")
  }

  function translateZh() {
    setTranslating(true); onError(null)
    startTransition(async () => {
      const res = await translateEcosystemDescription(descriptionEn)
      setTranslating(false)
      if (res.ok && res.zh) setDescriptionZh(res.zh)
      else onError(res.error ?? "Translate failed")
    })
  }

  function save() {
    onError(null)
    startTransition(async () => {
      const res = await saveEcosystemProject({
        id: isNew ? undefined : initial.id,
        name,
        slug: isNew ? slug : undefined,
        logoUrl: logoUrl || null,
        category,
        status,
        url,
        xUrl: xUrl || null,
        docsUrl: docsUrl || null,
        descriptionEn,
        descriptionZh,
        featured,
        sortOrder,
        published,
      })
      if (res.ok) onSaved()
      else onError(res.error ?? "Save failed")
    })
  }

  return (
    <div className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="flex items-center gap-4">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="h-16 w-16 rounded-md object-cover" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-md bg-zinc-800 text-xl text-zinc-500">
            {(name || "?")[0]?.toUpperCase()}
          </div>
        )}
        <div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickLogo} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Upload logo"}
          </button>
          <p className="mt-1 text-xs text-zinc-500">PNG/JPG/WebP/SVG, up to 8MB</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className={label} htmlFor="ep-name">Name</label>
          <input id="ep-name" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </div>
        <div className="flex flex-col gap-1">
          <label className={label} htmlFor="ep-slug">Slug</label>
          <input
            id="ep-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            disabled={!isNew}
            placeholder="auto-generated from name if left blank"
            className={`${inputCls} disabled:opacity-50`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className={label} htmlFor="ep-category">Category</label>
          <select id="ep-category" value={category} onChange={(e) => setCategory(e.target.value)} className={selectCls}>
            {ECOSYSTEM_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className={label} htmlFor="ep-status">Status</label>
          <select id="ep-status" value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
            {ECOSYSTEM_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className={label} htmlFor="ep-url">Website URL</label>
          <input id="ep-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" className={inputCls} />
        </div>
        <div className="flex flex-col gap-1">
          <label className={label} htmlFor="ep-x">X / Twitter URL</label>
          <input id="ep-x" value={xUrl} onChange={(e) => setXUrl(e.target.value)} placeholder="https://x.com/…" className={inputCls} />
        </div>
        <div className="flex flex-col gap-1">
          <label className={label} htmlFor="ep-docs">Docs URL</label>
          <input id="ep-docs" value={docsUrl} onChange={(e) => setDocsUrl(e.target.value)} placeholder="https://" className={inputCls} />
        </div>
        <div className="flex flex-col gap-1">
          <label className={label} htmlFor="ep-sort">Sort order</label>
          <input
            id="ep-sort"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
            className={inputCls}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className={label} htmlFor="ep-desc-en">Description (EN)</label>
        <textarea id="ep-desc-en" rows={3} value={descriptionEn} onChange={(e) => setDescriptionEn(e.target.value)} className={inputCls} />
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <label className={label} htmlFor="ep-desc-zh">Description (ZH)</label>
          <button
            type="button"
            onClick={translateZh}
            disabled={translating || !descriptionEn.trim()}
            className="text-xs text-sky-400 hover:text-sky-300 disabled:opacity-50"
          >
            {translating ? "Translating…" : "Translate EN→ZH"}
          </button>
        </div>
        <textarea id="ep-desc-zh" rows={3} value={descriptionZh} onChange={(e) => setDescriptionZh(e.target.value)} className={inputCls} />
      </div>

      <div className="flex flex-wrap items-center gap-6">
        <label className="inline-flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} /> Featured
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} /> Published
        </label>
      </div>

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-md border border-sky-500/40 px-3 py-1.5 text-sm text-sky-300 hover:bg-sky-500/10 disabled:opacity-50"
        >
          {isNew ? "Create project" : "Save changes"}
        </button>
      </div>
    </div>
  )
}
