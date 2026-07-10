"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { SystemNoticeDTO } from "@/lib/cms/system-notice"
import { setSystemNotice, translateNoticeAction } from "@/actions/admin/system-notice"

export function SystemNoticeCard({ initial, canEdit }: { initial: SystemNoticeDTO; canEdit: boolean }) {
  const router = useRouter()
  const [enabled, setEnabled] = useState(initial.enabled)
  const [showBanner, setShowBanner] = useState(initial.showBanner)
  const [showModal, setShowModal] = useState(initial.showModal)
  const [titleEn, setTitleEn] = useState(initial.titleEn)
  const [messageEn, setMessageEn] = useState(initial.messageEn)
  const [titleZh, setTitleZh] = useState(initial.titleZh)
  const [messageZh, setMessageZh] = useState(initial.messageZh)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [saving, startSave] = useTransition()
  const [translating, startTranslate] = useTransition()

  function save() {
    setError(null); setNote(null)
    startSave(async () => {
      const res = await setSystemNotice({ enabled, showBanner, showModal, titleEn, messageEn, titleZh, messageZh })
      if (res.ok) { setNote("Saved"); router.refresh() }
      else setError(res.error ?? "Failed to save")
    })
  }

  function translateZh() {
    setError(null); setNote(null)
    startTranslate(async () => {
      const res = await translateNoticeAction({ titleEn, messageEn })
      if (res.ok) { setTitleZh(res.titleZh); setMessageZh(res.messageZh); setNote("Translated (edit if needed)") }
      else setError(res.error)
    })
  }

  const busy = saving || translating
  const input = "w-full rounded border border-zinc-700 bg-zinc-900 p-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"

  return (
    <div className="space-y-5 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      <label className="flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-200">Active</span>
        <input type="checkbox" checked={enabled} disabled={!canEdit} onChange={(e) => setEnabled(e.target.checked)} />
      </label>

      <div className="flex gap-4 text-sm text-zinc-300">
        <label className="flex items-center gap-2"><input type="checkbox" checked={showBanner} disabled={!canEdit} onChange={(e) => setShowBanner(e.target.checked)} /> Show as banner</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={showModal} disabled={!canEdit} onChange={(e) => setShowModal(e.target.checked)} /> Show as modal</label>
      </div>

      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-zinc-500">English</p>
        <input className={input} placeholder="Title (shown uppercase in the modal)" value={titleEn} disabled={!canEdit} onChange={(e) => setTitleEn(e.target.value)} />
        <textarea className={input} rows={2} placeholder="Message" value={messageEn} disabled={!canEdit} onChange={(e) => setMessageEn(e.target.value)} />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-zinc-500">中文</p>
          <button type="button" className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-500 disabled:opacity-50" disabled={!canEdit || busy} onClick={translateZh}>
            {translating ? "Translating…" : "Translate to 中文"}
          </button>
        </div>
        <input className={input} placeholder="Title (中文, leave empty to fall back to English)" value={titleZh} disabled={!canEdit} onChange={(e) => setTitleZh(e.target.value)} />
        <textarea className={input} rows={2} placeholder="Message (中文)" value={messageZh} disabled={!canEdit} onChange={(e) => setMessageZh(e.target.value)} />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-500">
          {initial.updatedAt ? `Last updated ${new Date(initial.updatedAt).toLocaleString()}${initial.updatedBy ? ` · ${initial.updatedBy}` : ""}` : "Never saved"}
        </span>
        <button type="button" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50" disabled={!canEdit || busy} onClick={save}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {note ? <p className="text-sm text-emerald-400">{note}</p> : null}
    </div>
  )
}
