/**
 * Orchestrates the compliance import. `--dry-run` parses + maps + validates the
 * snapshots (no DB). Without it, loads into subfrost.io's Postgres (DATABASE_URL +
 * cloud-sql-proxy to the public io instance). Idempotent. Mirrors
 * scripts/migrate-fuel-data.ts.
 */
import { readFileSync, existsSync } from "node:fs"
import path from "node:path"
import { parseMtlDump, migrateMtl } from "@/lib/mtl/migrate"
import { parseFincenDumps, validateFincenDrafts, migrateFincen } from "@/lib/fincen/migrate"

const DUMP = "C:/Alkanes Geral Dev/.adminenv-extracted/dump"
const read = (name: string): string | undefined => {
  const p = path.join(DUMP, name)
  return existsSync(p) ? readFileSync(p, "utf8") : undefined
}

async function main() {
  const dryRun = process.argv.includes("--dry-run")

  const mtlText = read("mtl-state.json")
  const mtlRows = mtlText ? parseMtlDump(mtlText) : []

  const { drafts, submissions } = parseFincenDumps({
    form107: read("fincen-form-107-draft.json"),
    sar: read("fincen-sar-drafts.json"),
    ctr: read("fincen-ctr-drafts.json"),
    submissions: read("fincen-submissions.json"),
  })
  const warnings = validateFincenDrafts(drafts)

  console.log(`[compliance] parsed: mtl=${mtlRows.length} drafts=${drafts.length} submissions=${submissions.length}`)
  for (const w of warnings) console.warn(`[compliance][warn] ${w}`)

  if (dryRun) {
    console.log("[compliance] --dry-run: no DB writes")
    return
  }

  const mtlRes = await migrateMtl(mtlRows)
  const finRes = await migrateFincen(drafts, submissions)
  console.log(`[compliance] loaded: mtl=${mtlRes.total} drafts=${finRes.drafts} submissions=${finRes.submissions}`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
