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
  type EcosystemContractInput,
} from "@/actions/ecosystem/projects"
import { uploadInlineImage } from "@/lib/cms/inline-image-upload"
import { ECOSYSTEM_CATEGORIES, ECOSYSTEM_STATUSES, ECOSYSTEM_KINDS } from "@/lib/ecosystem/constants"
import { Markdown } from "@/lib/cms/markdown"

export interface AdminContract {
  id?: string
  label: string
  alkaneId: string
  noteEn: string
  noteZh: string
}

export interface AdminProject {
  id: string
  slug: string
  name: string
  logoUrl: string | null
  bannerUrl: string | null
  category: string
  status: string
  kind: string
  alkaneId: string | null
  url: string
  xUrl: string | null
  docsUrl: string | null
  descriptionEn: string
  descriptionZh: string
  featured: boolean
  sortOrder: number
  published: boolean
  profileEn: string
  profileZh: string
  contracts: AdminContract[]
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
    bannerUrl: null,
    category: ECOSYSTEM_CATEGORIES[0],
    status: ECOSYSTEM_STATUSES[0],
    kind: "App",
    alkaneId: null,
    url: "",
    xUrl: null,
    docsUrl: null,
    descriptionEn: "",
    descriptionZh: "",
    featured: false,
    sortOrder: 0,
    published: false,
    profileEn: "",
    profileZh: "",
    contracts: [],
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
    bannerUrl: p.bannerUrl,
    category: p.category,
    status: p.status,
    kind: p.kind,
    alkaneId: p.alkaneId,
    url: p.url,
    xUrl: p.xUrl,
    docsUrl: p.docsUrl,
    descriptionEn: p.descriptionEn,
    descriptionZh: p.descriptionZh,
    featured: p.featured,
    sortOrder: p.sortOrder,
    published: p.published,
    profileEn: p.profileEn,
    profileZh: p.profileZh,
    contracts: p.contracts.map(({ label, alkaneId, noteEn, noteZh }) => ({ label, alkaneId, noteEn, noteZh })),
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
  const [uploadError, setUploadError] = useState<string | null>(null)
  const bannerFileRef = useRef<HTMLInputElement>(null)
  const [uploadingBanner, setUploadingBanner] = useState(false)
  const [bannerError, setBannerError] = useState<string | null>(null)
  const [translating, setTranslating] = useState(false)

  const [name, setName] = useState(initial.name)
  const [slug, setSlug] = useState(initial.slug)
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl ?? "")
  const [bannerUrl, setBannerUrl] = useState(initial.bannerUrl ?? "")
  const [category, setCategory] = useState(initial.category)
  const [status, setStatus] = useState(initial.status)
  const [kind, setKind] = useState(initial.kind)
  const [alkaneId, setAlkaneId] = useState(initial.alkaneId ?? "")
  const [url, setUrl] = useState(initial.url)
  const [xUrl, setXUrl] = useState(initial.xUrl ?? "")
  const [docsUrl, setDocsUrl] = useState(initial.docsUrl ?? "")
  const [descriptionEn, setDescriptionEn] = useState(initial.descriptionEn)
  const [descriptionZh, setDescriptionZh] = useState(initial.descriptionZh)
  const [featured, setFeatured] = useState(initial.featured)
  const [sortOrder, setSortOrder] = useState(initial.sortOrder)
  const [published, setPublished] = useState(initial.published)
  const [profileEn, setProfileEn] = useState(initial.profileEn)
  const [profileZh, setProfileZh] = useState(initial.profileZh)
  const [contracts, setContracts] = useState<AdminContract[]>(initial.contracts)
  const [previewEn, setPreviewEn] = useState(false)
  const [previewZh, setPreviewZh] = useState(false)

  async function onPickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = "" // allow re-picking the same file after a failure
    setUploading(true); setUploadError(null); onError(null)
    try {
      setLogoUrl(await uploadInlineImage(file, fetch, "ecosystem"))
    } catch (err) {
      // Inline (next to the button), so a gateway HTML answer or network drop
      // can never strand the button on "Uploading…" with the error off-screen.
      const detail = err instanceof Error && err.message ? ` — ${err.message}` : ""
      setUploadError(`Upload failed${detail}`)
    } finally {
      setUploading(false)
    }
  }

  async function onPickBanner(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = "" // allow re-picking the same file after a failure
    setUploadingBanner(true); setBannerError(null); onError(null)
    try {
      setBannerUrl(await uploadInlineImage(file, fetch, "ecosystem"))
    } catch (err) {
      // Inline (next to the button), so a gateway HTML answer or network drop
      // can never strand the button on "Uploading…" with the error off-screen.
      const detail = err instanceof Error && err.message ? ` — ${err.message}` : ""
      setBannerError(`Upload failed${detail}`)
    } finally {
      setUploadingBanner(false)
    }
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
        bannerUrl: bannerUrl || null,
        category,
        status,
        kind,
        alkaneId: alkaneId.trim() || null,
        url,
        xUrl: xUrl || null,
        docsUrl: docsUrl || null,
        descriptionEn,
        descriptionZh,
        featured,
        sortOrder,
        published,
        profileEn,
        profileZh,
        contracts: contracts.map(({ label, alkaneId, noteEn, noteZh }) => ({ label, alkaneId, noteEn, noteZh })) satisfies EcosystemContractInput[],
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
          {uploadError && (
            <p role="alert" className="mt-1 text-xs text-rose-400">{uploadError}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4">
        {bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bannerUrl} alt="" className="h-16 w-40 rounded-md object-cover" />
        ) : (
          <div className="flex h-16 w-40 items-center justify-center rounded-md bg-zinc-800 text-xs text-zinc-500">No banner</div>
        )}
        <div>
          <input ref={bannerFileRef} type="file" accept="image/*" aria-label="Upload banner file" className="hidden" onChange={onPickBanner} />
          <button type="button" onClick={() => bannerFileRef.current?.click()} disabled={uploadingBanner}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50">
            {uploadingBanner ? "Uploading…" : "Upload banner"}
          </button>
          {bannerUrl ? (
            <button type="button" onClick={() => setBannerUrl("")} className="ml-2 text-xs text-zinc-500 hover:text-rose-400">Remove</button>
          ) : null}
          <p className="mt-1 text-xs text-zinc-500">Wide cover image (profile page)</p>
          {bannerError && <p role="alert" className="mt-1 text-xs text-rose-400">{bannerError}</p>}
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
          <label className={label} htmlFor="ep-kind">Kind</label>
          <select id="ep-kind" value={kind} onChange={(e) => setKind(e.target.value)} className={selectCls}>
            {ECOSYSTEM_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className={label} htmlFor="ep-alkane-id">Alkane ID</label>
          <input
            id="ep-alkane-id"
            value={alkaneId}
            onChange={(e) => setAlkaneId(e.target.value)}
            placeholder="block:tx — e.g. 2:0"
            className={inputCls + " font-mono"}
          />
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

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <label className={label} htmlFor="ep-profile-en">Profile (EN)</label>
          <button type="button" onClick={() => setPreviewEn(!previewEn)} className="text-xs text-sky-400 hover:text-sky-300">
            {previewEn ? "Edit EN" : "Preview EN"}
          </button>
        </div>
        {previewEn ? (
          <div className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2">
            <Markdown variant="compact">{profileEn}</Markdown>
          </div>
        ) : (
          <textarea id="ep-profile-en" rows={12} value={profileEn} onChange={(e) => setProfileEn(e.target.value)}
            placeholder="Long-form project profile in Markdown (GFM tables, code blocks…)"
            className={inputCls + " font-mono text-[12.5px]"} />
        )}
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <label className={label} htmlFor="ep-profile-zh">Profile (ZH)</label>
          <button type="button" onClick={() => setPreviewZh(!previewZh)} className="text-xs text-sky-400 hover:text-sky-300">
            {previewZh ? "Edit ZH" : "Preview ZH"}
          </button>
        </div>
        {previewZh ? (
          <div className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2">
            <Markdown variant="compact">{profileZh}</Markdown>
          </div>
        ) : (
          <textarea id="ep-profile-zh" rows={12} value={profileZh} onChange={(e) => setProfileZh(e.target.value)}
            placeholder="Long-form project profile in Markdown (GFM tables, code blocks…)"
            className={inputCls + " font-mono text-[12.5px]"} />
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className={label}>Contracts</span>
          <button type="button" onClick={() => setContracts([...contracts, { label: "", alkaneId: "", noteEn: "", noteZh: "" }])}
            className="text-xs text-sky-400 hover:text-sky-300">
            Add contract
          </button>
        </div>
        {contracts.map((c, i) => (
          <div key={i} className="grid grid-cols-1 gap-2 rounded-md border border-zinc-800 p-2 sm:grid-cols-[1fr_110px_1fr_1fr_auto]">
            <input aria-label={`Contract ${i + 1} label`} placeholder="Label" value={c.label}
              onChange={(e) => setContracts(contracts.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} className={inputCls} />
            <input aria-label={`Contract ${i + 1} alkane ID`} placeholder="4:257" value={c.alkaneId}
              onChange={(e) => setContracts(contracts.map((x, j) => (j === i ? { ...x, alkaneId: e.target.value } : x)))} className={inputCls + " font-mono"} />
            <input aria-label={`Contract ${i + 1} note EN`} placeholder="Note (EN)" value={c.noteEn}
              onChange={(e) => setContracts(contracts.map((x, j) => (j === i ? { ...x, noteEn: e.target.value } : x)))} className={inputCls} />
            <input aria-label={`Contract ${i + 1} note ZH`} placeholder="Note (ZH)" value={c.noteZh}
              onChange={(e) => setContracts(contracts.map((x, j) => (j === i ? { ...x, noteZh: e.target.value } : x)))} className={inputCls} />
            <button type="button" aria-label={`Remove contract ${i + 1}`}
              onClick={() => setContracts(contracts.filter((_, j) => j !== i))}
              className="self-center text-zinc-500 hover:text-rose-400"><Trash2 size={14} /></button>
          </div>
        ))}
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
