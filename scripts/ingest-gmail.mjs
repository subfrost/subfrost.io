#!/usr/bin/env node
// ===========================================================================
// ingest-gmail.mjs — pull document attachments (invoices, W-8/W-9s, signed
// PDFs, agreements) out of a Gmail mailbox over IMAP into a local staging dir,
// so they can be ingested via `ingest-drive.mjs --source mail`.
//
// Efficient: reads each message's bodyStructure and downloads ONLY the
// attachment parts whose MIME/filename looks like a real document — it does not
// download full message bodies. Dedupes by (filename, size).
//
// USAGE
//   GMAIL_USER=you@gmail.com GMAIL_APP_PASSWORD=xxxx \
//     node scripts/ingest-gmail.mjs [--mailbox "[Gmail]/All Mail"] [--out <dir>] [--limit N] [--report]
//
// FLAGS
//   --mailbox <name>   IMAP mailbox (default "[Gmail]/All Mail"; use "INBOX" for inbox only)
//   --out <dir>        staging dir (default ~/subfrost-docs-staging/mail/attachments)
//   --limit N          cap messages scanned (smoke test)
//   --report           list what WOULD be saved, write nothing
// ===========================================================================

import { ImapFlow } from "imapflow"
import { mkdirSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

const argv = process.argv.slice(2)
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d }
const has = (k) => argv.includes(k)
const MAILBOX = arg("--mailbox", "[Gmail]/All Mail")
const OUT = arg("--out", join(process.env.HOME, "subfrost-docs-staging/mail/attachments"))
const LIMIT = arg("--limit") ? parseInt(arg("--limit"), 10) : Infinity
const REPORT = has("--report")

const USER = process.env.GMAIL_USER
const PASS = process.env.GMAIL_APP_PASSWORD
if (!USER || !PASS) { console.error("error: set GMAIL_USER + GMAIL_APP_PASSWORD"); process.exit(1) }

const DOC_EXT = /\.(pdf|docx?|xlsx?|pptx?|csv|rtf|txt|png|jpe?g)$/i
const DOC_MIME = /(pdf|msword|officedocument|ms-excel|ms-powerpoint|rtf|csv|image\/(png|jpeg))/i
function isDoc(node) {
  const name = node?.dispositionParameters?.filename || node?.parameters?.name || ""
  if (name && DOC_EXT.test(name)) return name
  if (node?.type && DOC_MIME.test(node.type) && name) return name
  return null
}
// recurse the bodyStructure collecting {part, filename, size}. Real attachments
// only; inline signature logos are dropped (images kept only if they are a true
// attachment and >= 50KB — invoices/W-8s are PDFs/docx, not tiny sig images).
function attachments(node, out = []) {
  if (!node) return out
  const fn = isDoc(node)
  if (fn && node.part) {
    const isImg = /image\//i.test(node.type || "")
    const isAttach = node.disposition === "attachment"
    const keep = isImg ? (isAttach && (node.size || 0) >= 50000) : true
    if (keep) out.push({ part: node.part, filename: fn, size: node.size || 0, type: node.type })
  }
  for (const c of node.childNodes || []) attachments(c, out)
  return out
}
const sanitize = (s) => String(s).replace(/[^\w.\-() ]+/g, "_").slice(0, 120)
async function toBuf(stream) { const chunks = []; for await (const c of stream) chunks.push(c); return Buffer.concat(chunks) }

// existing (basename→sizes) so re-runs skip dups, incl. anything already ingested
const seen = new Set()
if (existsSync(OUT)) for (const f of readdirSync(OUT)) { try { seen.add(`${f}:${statSync(join(OUT, f)).size}`) } catch {} }

mkdirSync(OUT, { recursive: true })
const client = new ImapFlow({
  host: "imap.gmail.com", port: 993, secure: true,
  auth: { user: USER, pass: PASS }, logger: false, socketTimeout: 120000,
})
await client.connect()
const lock = await client.getMailboxLock(MAILBOX)
let scanned = 0, saved = 0, dup = 0, skipped = 0
// PASS 1: collect attachment refs (bodyStructure only — no body download inside
// the fetch iterator, which is what deadlocks imapflow on large mailboxes).
const todo = []
try {
  for await (const msg of client.fetch("1:*", { uid: true, envelope: true, bodyStructure: true, internalDate: true })) {
    if (scanned >= LIMIT) break
    scanned++
    const atts = attachments(msg.bodyStructure)
    if (!atts.length) continue
    const date = (msg.internalDate || msg.envelope?.date || new Date()).toISOString().slice(0, 10)
    const from = sanitize(msg.envelope?.from?.[0]?.address || "unknown").slice(0, 40)
    for (const a of atts) {
      if (!DOC_EXT.test(a.filename) && !DOC_MIME.test(a.type || "")) { skipped++; continue }
      const base = `${date}__${from}__${sanitize(a.filename)}`
      if (seen.has(`${base}:${a.size}`) || seen.has(`${base}:0`)) { dup++; continue }
      seen.add(`${base}:${a.size}`)
      todo.push({ uid: msg.uid, part: a.part, type: a.type, size: a.size, base })
    }
    if (scanned % 1000 === 0) console.log(`  …scanned ${scanned}, queued ${todo.length}`)
  }
} finally { lock.release() }

console.log(`scan complete: scanned=${scanned} attachments-to-fetch=${todo.length}`)
if (REPORT) {
  for (const t of todo) console.log(`  would save [${t.type}] ${t.base} (${t.size}b)`)
  saved = todo.length
} else {
  // PASS 2: download each collected attachment (fetch iterator is now closed).
  for (const t of todo) {
    try {
      const { content } = await client.download(t.uid, t.part, { uid: true })
      const buf = await toBuf(content)
      writeFileSync(join(OUT, t.base), buf)
      saved++
      if (saved % 50 === 0) console.log(`  …downloaded ${saved}/${todo.length}`)
    } catch (e) { console.error(`  ! ${t.base}: ${e.message}`); skipped++ }
  }
}
await client.logout()
console.log(`\n=== ingest-gmail ${REPORT ? "(REPORT)" : ""} ===`)
console.log(`mailbox: ${MAILBOX}  scanned: ${scanned}  saved: ${saved}  dup(skipped): ${dup}  non-doc(skipped): ${skipped}`)
console.log(`out: ${OUT}`)
