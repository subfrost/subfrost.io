import type { FileView } from "@/lib/files/manager"

/** Humanize a byte count provided as a decimal string (FileView.size). */
export function humanSize(bytes: string | number): string {
  const n = typeof bytes === "string" ? Number(bytes) : bytes
  if (!Number.isFinite(n) || n <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB", "PB"]
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  const v = n / Math.pow(1024, i)
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`
}

export function relTime(iso: string): string {
  const d = Date.now() - new Date(iso).getTime()
  const m = Math.floor(d / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

export type PreviewKind = "image" | "video" | "audio" | "pdf" | "text" | "other"

export function previewKind(mime: string, name: string): PreviewKind {
  const m = (mime || "").toLowerCase()
  const ext = name.toLowerCase().split(".").pop() ?? ""
  if (m.startsWith("image/")) return "image"
  if (m.startsWith("video/")) return "video"
  if (m.startsWith("audio/")) return "audio"
  if (m === "application/pdf" || ext === "pdf") return "pdf"
  if (
    m.startsWith("text/") ||
    m === "application/json" ||
    m === "application/xml" ||
    m === "application/javascript" ||
    m === "application/yaml" ||
    ["txt", "md", "markdown", "json", "xml", "yaml", "yml", "csv", "log", "js", "ts", "tsx", "jsx", "css", "html", "py", "rs", "go", "sh", "toml", "ini", "env"].includes(ext)
  ) {
    return "text"
  }
  return "other"
}

/** Short, human label for a file's type. */
export function typeLabel(mime: string, name: string): string {
  const ext = name.toLowerCase().split(".").pop()
  if (ext && ext !== name.toLowerCase()) return ext.toUpperCase()
  if (mime && mime !== "application/octet-stream") {
    const sub = mime.split("/").pop() ?? mime
    return sub.toUpperCase()
  }
  return "FILE"
}

/**
 * Turn a Postgres ts_headline snippet into safe highlight HTML. The DB wraps hits
 * in %%HL%%…%%EH%% sentinels; document text can contain arbitrary markup, so we
 * HTML-escape everything first, then convert only the sentinels to <mark>. Never
 * emits attacker-controlled tags.
 */
export function highlightSnippet(s: string): string {
  const esc = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  return esc
    .split("%%HL%%").join('<mark class="rounded bg-amber-400/25 px-0.5 text-amber-200">')
    .split("%%EH%%").join("</mark>")
}

/** Minimal, dependency-free markdown → HTML for the preview pane. Escapes first. */
export function renderMarkdown(src: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const lines = esc(src).split(/\r?\n/)
  const out: string[] = []
  let inCode = false
  let inList = false
  const inline = (s: string) =>
    s
      .replace(/`([^`]+)`/g, '<code class="rounded bg-zinc-800 px-1 text-sky-300">$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a class="text-sky-400 underline" href="$2" target="_blank" rel="noreferrer">$1</a>')
  for (const raw of lines) {
    if (raw.trim().startsWith("```")) {
      if (inCode) { out.push("</code></pre>"); inCode = false }
      else { if (inList) { out.push("</ul>"); inList = false } out.push('<pre class="my-2 overflow-x-auto rounded-lg bg-zinc-950 p-3 text-xs text-zinc-300"><code>') ; inCode = true }
      continue
    }
    if (inCode) { out.push(raw + "\n"); continue }
    const h = raw.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      if (inList) { out.push("</ul>"); inList = false }
      const lvl = h[1].length
      const sizes = ["text-xl", "text-lg", "text-base", "text-sm", "text-sm", "text-sm"]
      out.push(`<h${lvl} class="mt-3 mb-1 font-semibold text-white ${sizes[lvl - 1]}">${inline(h[2])}</h${lvl}>`)
      continue
    }
    const li = raw.match(/^\s*[-*]\s+(.*)$/)
    if (li) {
      if (!inList) { out.push('<ul class="my-1 list-disc pl-5 text-zinc-300">'); inList = true }
      out.push(`<li>${inline(li[1])}</li>`)
      continue
    }
    if (inList) { out.push("</ul>"); inList = false }
    if (raw.trim() === "") { out.push("") ; continue }
    out.push(`<p class="my-1 text-zinc-300">${inline(raw)}</p>`)
  }
  if (inCode) out.push("</code></pre>")
  if (inList) out.push("</ul>")
  return out.join("\n")
}
