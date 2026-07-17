#!/usr/bin/env node
// ===========================================================================
// ingest-drive.mjs — bulk-load the curated SUBFROST / OYL gdrive dumps into the
// Documents drive (Folder + DriveFile rows in Postgres, bytes in the
// subfrost-docs GCS bucket). Mirrors the dump's folder structure, tags each
// file, and (best-effort) links it to registry entities it names.
//
// This replaces gdrive/docuseal: once a dump is ingested + verified, the source
// Google Drive can be deleted.
//
// USAGE
//   # 1. See exactly what WOULD be ingested (no DB, no GCS, no creds needed):
//   node scripts/ingest-drive.mjs --source subfrost --report
//   node scripts/ingest-drive.mjs --source oyl --report
//
//   # 2. Real run (needs DATABASE_URL + GCS ADC; bytes go to subfrost-docs):
//   DATABASE_URL=... node scripts/ingest-drive.mjs --source subfrost
//   DATABASE_URL=... node scripts/ingest-drive.mjs --source oyl
//
//   # 3. Re-link already-ingested files to entities added to the registry later:
//   DATABASE_URL=... node scripts/ingest-drive.mjs --source subfrost --relink
//
// FLAGS
//   --source subfrost|oyl   which dump (required)
//   --root <path>           override the dump root (default: ../<source>-dump)
//   --report                list planned ingest, write nothing (no creds needed)
//   --relink                skip uploads; only (re)build entity links on existing files
//   --limit N               cap number of files (smoke test)
//   --dry-run               resolve folders/entities but do not write
//
// Idempotent: a file already present at (folder, name) is skipped, so re-runs
// resume safely. Entity links upsert on (file, entity, role).
// ===========================================================================

import { readdirSync, statSync, readFileSync } from "node:fs"
import { join, basename, relative, extname, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { randomUUID } from "node:crypto"

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO = join(__dirname, "..")
const PROJECTS = join(REPO, "..")

// --- args ------------------------------------------------------------------
const argv = process.argv.slice(2)
const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined }
const has = (k) => argv.includes(k)
const SOURCE = arg("--source")
const REPORT = has("--report")
const RELINK = has("--relink")
const DRY = has("--dry-run") || REPORT
const LIMIT = arg("--limit") ? parseInt(arg("--limit"), 10) : Infinity
// Read-only: resolve every planned file to its DB DriveFile.id + local abs path
// and append them as JSONL to this file. Used to drive classification agents.
const EMIT_MANIFEST = arg("--emit-manifest")

if (!SOURCE || !["subfrost", "oyl", "gdrive", "mail", "docuseal"].includes(SOURCE)) {
  console.error("error: --source must be 'subfrost', 'oyl', 'gdrive', 'mail', or 'docuseal'")
  process.exit(1)
}
const DEFAULT_ROOTS = {
  gdrive: join(process.env.HOME || PROJECTS, "subfrost-docs-staging/gdrive"),
  mail: join(process.env.HOME || PROJECTS, "subfrost-docs-staging/mail"),
  docuseal: join(process.env.HOME || PROJECTS, "subfrost-docs-staging/docuseal"),
}
const ROOT = arg("--root") || DEFAULT_ROOTS[SOURCE] || join(PROJECTS, `${SOURCE}-dump`)
const SCOPE = SOURCE === "oyl" ? "OYL" : "SUBFROST"

// --- curation manifest -----------------------------------------------------
// Each entry maps a subtree of the dump to a destination folder path in the
// drive. `exts` (if set) is an allowlist; otherwise DEFAULT_DOC_EXTS applies.
// Anything outside the manifest is reported as skipped (never silently dropped).
const DEFAULT_DOC_EXTS = new Set([
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv", "md", "txt",
  "rtf", "pages", "numbers", "key", "png", "jpg", "jpeg",
])
// Never upload these regardless of folder (raw archives / app state / media).
const HARD_SKIP_EXTS = new Set([
  "zip", "tar", "gz", "mov", "mp4", "vtt", "srt", "mbox", "jsonl", "json",
  "ics", "ttf", "pkpass", "ds_store", "html", "log", "tasks", "vcf", "py",
])

const MANIFESTS = {
  subfrost: [
    { src: "Subzero_Legal_Package", dest: "Legal" },
    { src: "Subzero_Equity_Docs", dest: "Equity" },
    { src: "Valuation_Data_Package", dest: "Valuation (409A)" },
    { src: "Column Paperwork", dest: "Banking/Column" },
    { src: "Apple_Developer_Verification", dest: "Apple Developer" },
    { src: "Templates_To_Fill", dest: "Templates" },
    // originals (PDF/DOCX) of the most important Drive trees:
    { src: "extracted/Takeout/Drive/Legal", dest: "Legal/Drive Legal" },
    { src: "extracted/Takeout/Drive/RSU", dest: "Equity/RSU" },
    { src: "extracted/Takeout/Drive/Taxes", dest: "Taxes" },
    // emailed attachments that are real documents (invoices, signed PDFs):
    { src: "corpus/mail/attachments", dest: "Email Attachments", exts: new Set(["pdf", "docx", "doc", "xlsx", "csv", "png", "jpg"]) },
    // top-level cheat-sheets / packs:
    { src: ".", dest: "Reports", depth1: true, exts: new Set(["md"]) },
  ],
  oyl: [
    { src: "DLA_Piper_Documents", dest: "DLA Piper" },
    { src: "SUBFROST_OYL_PROJECT", dest: "Subfrost↔OYL Project" },
    // top-level OYL analysis reports (.md) → Reports:
    { src: ".", dest: "Reports", depth1: true, exts: new Set(["md", "csv"]) },
  ],
  // Live subzeroresearchltd Google Drive (rclone copy → staging, gdocs exported
  // to office formats). Idempotent vs the earlier Takeout ingest: existing
  // (folder,name) skip, only the delta is added.
  gdrive: [
    { src: "Legal", dest: "Legal/Drive Legal" },
    { src: "RSU", dest: "Equity/RSU" },
    { src: "Taxes", dest: "Taxes" },
    // loose root-level docs (decks, NDAs, SAFEs, letterhead, invitation letters):
    { src: ".", dest: "Drive Root", depth1: true },
  ],
  // Gmail attachment pull (scripts/ingest-gmail.mjs → staging). Invoices, W-8/W-9,
  // signed PDFs. Idempotent vs the earlier Takeout mail ingest.
  mail: [
    { src: "attachments", dest: "Email Attachments", exts: new Set(["pdf", "docx", "doc", "xlsx", "xls", "csv", "png", "jpg", "jpeg", "pptx"]) },
  ],
  // Executed/signed PDFs exported from the DocuSeal account (via camoufox).
  docuseal: [
    { src: ".", dest: "Legal/E-Signed", depth1: true },
  ],
}

// Subtrees we deliberately DO NOT ingest (logged in the report so it's explicit).
const SKIPPED_NOTE = {
  subfrost: [
    "extracted/Takeout/<all non-Legal/RSU/Taxes services> (Calendar, Chrome, Photos, branding, videos…)",
    "corpus/docs + corpus/mail/messages (text mirrors + 5,657 email .txt — archive, not documents)",
  ],
  oyl: [
    "Everything-*.zip (4 raw Google Takeout archives, ~7GB)",
    "work/ (raw per-account takeout: mail, text/atxt/drivetext mirrors, attachments)",
    "extracted/ (raw extracted Takeout tree)",
    "loose screenshots (*.jpg)",
  ],
  gdrive: [
    "China Vids / Demo / Promos / Branding / Images / ETHDenver (media, excluded from the rclone copy)",
    "Gabe Old Centric Computer (personal machine backup, not company docs)",
  ],
  mail: [
    "message bodies (only document attachments are pulled, not email text)",
  ],
  docuseal: [
    "DocuSeal built-in sample template (removed before ingest)",
  ],
}

// --- mime ------------------------------------------------------------------
const MIME = {
  pdf: "application/pdf", doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  csv: "text/csv", md: "text/markdown", txt: "text/plain", rtf: "application/rtf",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
}
const mimeOf = (name) => MIME[extname(name).slice(1).toLowerCase()] || "application/octet-stream"

// --- walk ------------------------------------------------------------------
function* walk(dir, { depth1 = false } = {}) {
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue
    const full = join(dir, e.name)
    if (e.isDirectory()) { if (!depth1) yield* walk(full) }
    else if (e.isFile()) yield full
  }
}

// Build the planned ingest list from the manifest.
function plan() {
  const items = [] // { abs, rel, destFolder, tags }
  const skippedExt = new Map()
  for (const m of MANIFESTS[SOURCE]) {
    const base = join(ROOT, m.src)
    let exists = true
    try { statSync(base) } catch { exists = false }
    if (!exists) continue
    const allow = m.exts || DEFAULT_DOC_EXTS
    for (const abs of walk(base, { depth1: m.depth1 })) {
      const ext = extname(abs).slice(1).toLowerCase()
      if (HARD_SKIP_EXTS.has(ext) || !allow.has(ext)) {
        skippedExt.set(ext || "(none)", (skippedExt.get(ext || "(none)") || 0) + 1)
        continue
      }
      const relToSrc = m.depth1 ? basename(abs) : relative(base, abs)
      const sub = dirname(relToSrc)
      const destFolder = sub === "." ? m.dest : `${m.dest}/${sub}`
      const tags = ["ingest", SOURCE, ...m.dest.split("/").map((s) => s.toLowerCase())]
      items.push({ abs, rel: relative(ROOT, abs), destFolder, name: basename(abs), ext, tags })
      if (items.length >= LIMIT) return { items, skippedExt }
    }
  }
  return { items, skippedExt }
}

// --- entity matching -------------------------------------------------------
// Conservative: match an entity if its full name OR a >=4-char distinctive token
// appears in the file's path. Returns [{entityId, name, role}].
function buildMatcher(entities) {
  const idx = entities.map((e) => {
    const tokens = e.name.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 4)
    return { id: e.id, name: e.name, full: e.name.toLowerCase(), tokens }
  })
  return (hay) => {
    const h = hay.toLowerCase()
    const out = []
    for (const e of idx) {
      if (e.full.length >= 4 && h.includes(e.full)) { out.push({ entityId: e.id, name: e.name, exact: true }); continue }
      if (e.tokens.some((t) => h.includes(t))) out.push({ entityId: e.id, name: e.name, exact: false })
    }
    return out
  }
}
// Folder → default link role.
function roleFor(destFolder) {
  const d = destFolder.toLowerCase()
  if (d.includes("safe") || d.includes("token rights") || d.includes("agreement") ||
      d.includes("warrant") || d.includes("side letter") || d.includes("consent") ||
      d.includes("legal") || d.includes("equity")) return "SIGNATORY"
  return "SUBJECT"
}

// ===========================================================================
async function main() {
  const { items, skippedExt } = plan()

  console.log(`\n=== ingest-drive: ${SOURCE} (scope ${SCOPE}) ===`)
  console.log(`root: ${ROOT}`)
  console.log(`planned files: ${items.length}`)
  const byFolder = {}
  for (const it of items) byFolder[it.destFolder.split("/")[0]] = (byFolder[it.destFolder.split("/")[0]] || 0) + 1
  console.log("by top folder:", byFolder)
  console.log("skipped by ext:", Object.fromEntries([...skippedExt.entries()].sort((a, b) => b[1] - a[1])))
  console.log("subtrees intentionally NOT ingested:")
  for (const s of SKIPPED_NOTE[SOURCE]) console.log("  -", s)

  if (REPORT) {
    console.log("\n(report mode — nothing written. Sample of planned files:)")
    for (const it of items.slice(0, 25)) console.log(`  [${it.destFolder}]  ${it.name}`)
    if (items.length > 25) console.log(`  … +${items.length - 25} more`)
    return
  }

  // Read-only manifest emit: map each planned local file to its DB DriveFile row.
  if (EMIT_MANIFEST) {
    const { PrismaClient } = await import("@prisma/client")
    const prisma = new PrismaClient()
    const { appendFileSync } = await import("node:fs")
    const folderIdCache = new Map() // "A/B/C" -> id (resolve existing only)
    async function findFolderId(path) {
      if (folderIdCache.has(path)) return folderIdCache.get(path)
      const segs = path.split("/")
      let parentId = null, acc = ""
      for (const seg of segs) {
        acc = acc ? `${acc}/${seg}` : seg
        if (folderIdCache.has(acc)) { parentId = folderIdCache.get(acc); continue }
        const f = await prisma.folder.findFirst({ where: { parentId, name: seg, scope: SCOPE } })
        if (!f) { folderIdCache.set(acc, null); return null }
        folderIdCache.set(acc, f.id); parentId = f.id
      }
      return parentId
    }
    let emitted = 0, missing = 0
    for (const it of items) {
      const folderId = await findFolderId(it.destFolder)
      const file = folderId ? await prisma.driveFile.findFirst({ where: { folderId, name: it.name }, select: { id: true, tags: true, mimeType: true } }) : null
      if (!file) { missing++; continue }
      appendFileSync(EMIT_MANIFEST, JSON.stringify({ id: file.id, scope: SCOPE, folderPath: it.destFolder, name: it.name, abs: it.abs, ext: it.ext, mime: file.mimeType, tags: file.tags }) + "\n")
      emitted++
    }
    console.log(`\nmanifest: emitted=${emitted} missing(no DB row)=${missing} -> ${EMIT_MANIFEST}`)
    await prisma.$disconnect()
    return
  }

  // Live run: need prisma (+ GCS unless --relink).
  const { PrismaClient } = await import("@prisma/client")
  const prisma = new PrismaClient()
  let bucket = null
  if (!RELINK && !DRY) {
    const { Storage } = await import("@google-cloud/storage")
    bucket = new Storage().bucket(process.env.DOCS_BUCKET || "subfrost-docs")
  }

  const entities = await prisma.legalEntity.findMany({ select: { id: true, name: true } })
  const match = buildMatcher(entities)
  console.log(`\nregistry entities loaded for matching: ${entities.length}`)

  // folder path cache
  const folderCache = new Map() // "A/B/C" -> id
  async function ensureFolder(path) {
    if (folderCache.has(path)) return folderCache.get(path)
    const segs = path.split("/")
    let parentId = null
    let acc = ""
    for (const seg of segs) {
      acc = acc ? `${acc}/${seg}` : seg
      if (folderCache.has(acc)) { parentId = folderCache.get(acc); continue }
      let f = await prisma.folder.findFirst({ where: { parentId, name: seg } })
      if (!f && !DRY) f = await prisma.folder.create({ data: { name: seg, parentId, scope: SCOPE } })
      const id = f ? f.id : `dry:${acc}`
      folderCache.set(acc, id)
      parentId = id
    }
    return parentId
  }

  let uploaded = 0, skipped = 0, linked = 0, suggested = 0
  for (const it of items) {
    const folderId = await ensureFolder(it.destFolder)
    const matches = match(it.rel)

    if (RELINK) {
      const file = await prisma.driveFile.findFirst({ where: { folderId, name: it.name } })
      if (!file) continue
      for (const mm of matches) {
        if (!DRY) await prisma.entityFileLink.upsert({
          where: { fileId_entityId_role: { fileId: file.id, entityId: mm.entityId, role: roleFor(it.destFolder) } },
          update: {}, create: { fileId: file.id, entityId: mm.entityId, role: roleFor(it.destFolder), annotation: `auto: matched "${mm.name}"` },
        })
        linked++
      }
      continue
    }

    // skip if already ingested (idempotent re-run)
    const dup = DRY ? null : await prisma.driveFile.findFirst({ where: { folderId, name: it.name } })
    if (dup) { skipped++; continue }

    const data = readFileSync(it.abs)
    const gcsObject = `files/${randomUUID()}`
    if (!DRY) await bucket.file(gcsObject).save(data, { contentType: mimeOf(it.name), resumable: false })

    const suggestedEntities = matches.map((m) => m.name)
    let file = null
    if (!DRY) file = await prisma.driveFile.create({
      data: {
        name: it.name, folderId, scope: SCOPE, gcsObject, mimeType: mimeOf(it.name),
        size: BigInt(data.byteLength), tags: it.tags,
        metadata: suggestedEntities.length ? { source: SOURCE, suggestedEntities } : { source: SOURCE },
      },
    })
    uploaded++

    for (const mm of matches) {
      if (file && !DRY) await prisma.entityFileLink.upsert({
        where: { fileId_entityId_role: { fileId: file.id, entityId: mm.entityId, role: roleFor(it.destFolder) } },
        update: {}, create: { fileId: file.id, entityId: mm.entityId, role: roleFor(it.destFolder), annotation: `auto: matched "${mm.name}"` },
      })
      linked++
    }
    suggested += suggestedEntities.length
    if (uploaded % 50 === 0) console.log(`  …${uploaded} uploaded`)
  }

  console.log(`\ndone. uploaded=${uploaded} skipped(existing)=${skipped} entityLinks=${linked} (suggestions=${suggested})`)
  if (DRY) console.log("(dry-run — no writes performed)")
  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
