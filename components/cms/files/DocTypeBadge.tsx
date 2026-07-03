import { DOC_TYPE_LABEL, DOC_STATUS_LABEL } from "@/lib/files/doc-types"

// Small pills for a file's classified document-type + execution status.
// Used in the drive listing and the details panel.

const STATUS_TONE: Record<string, string> = {
  executed: "border-emerald-700/60 bg-emerald-950/40 text-emerald-300",
  partially_executed: "border-emerald-800/50 bg-emerald-950/30 text-emerald-400/90",
  unsigned: "border-amber-700/50 bg-amber-950/30 text-amber-300",
  draft: "border-amber-800/50 bg-amber-950/20 text-amber-400/90",
  template: "border-zinc-700 bg-zinc-800/50 text-zinc-400",
  void: "border-red-800/60 bg-red-950/30 text-red-300",
  na: "border-zinc-700/60 bg-zinc-800/40 text-zinc-500",
}

export function DocTypeBadge({ docType, docStatus, className = "" }: { docType?: string | null; docStatus?: string | null; className?: string }) {
  if (!docType && !docStatus) return null
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {docType && (
        <span className="inline-flex items-center rounded-full border border-sky-800/60 bg-sky-950/40 px-2 py-0.5 text-[11px] font-medium text-sky-300">
          {DOC_TYPE_LABEL[docType] ?? docType}
        </span>
      )}
      {docStatus && docStatus !== "na" && (
        <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${STATUS_TONE[docStatus] ?? STATUS_TONE.na}`}>
          {DOC_STATUS_LABEL[docStatus] ?? docStatus}
        </span>
      )}
    </span>
  )
}
