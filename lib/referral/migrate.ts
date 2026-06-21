/**
 * One-time migration of the referral graph from subfrost-app's Postgres
 * (`invite_codes` + `invite_code_redemptions`, snake_case via Prisma @@map) into
 * subfrost.io's `InviteCode` + `InviteCodeRedemption`. Parses the `pg_dump` COPY
 * blocks produced by `gcloud sql export` (one table per file — Cloud SQL's
 * multi-table export only emits the first), preserving ids so the self-FK
 * (parentCodeId) and the redemption→code FK stay intact and re-runs are idempotent.
 *
 * Pure parsing/sorting here is unit-tested; the DB load takes an injected client.
 * The runnable entrypoint is `scripts/migrate-referral-data.ts`.
 */
import type { PrismaClient } from "@prisma/client"

export interface InviteCodeRecord {
  id: string
  code: string
  description: string | null
  isActive: boolean
  createdAt: Date
  parentCodeId: string | null
  ownerTaprootAddress: string | null
}

export interface RedemptionRecord {
  id: string
  codeId: string
  taprootAddress: string
  segwitAddress: string | null
  taprootPubkey: string | null
  redeemedAt: Date
  updatedAt: Date | null
}

// --- pg_dump COPY parsing --------------------------------------------------

/** Decode one COPY text-format field: `\N` → null, else unescape backslash
 *  sequences (\t \n \r \b \f \v \\ and \<char> → <char>). */
function decodeField(raw: string): string | null {
  if (raw === "\\N") return null
  let out = ""
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== "\\") {
      out += raw[i]
      continue
    }
    const next = raw[++i]
    switch (next) {
      case "t": out += "\t"; break
      case "n": out += "\n"; break
      case "r": out += "\r"; break
      case "b": out += "\b"; break
      case "f": out += "\f"; break
      case "v": out += "\v"; break
      default: out += next ?? "\\"
    }
  }
  return out
}

/** Extract a `COPY <table> (cols) FROM stdin; … \.` block into row objects.
 *  Records split on real newlines (pg_dump escapes embedded newlines as \n). */
export function parseCopyBlock(sql: string, table: string): Record<string, string | null>[] {
  const lines = sql.split("\n")
  const start = lines.findIndex(
    (l) => l.startsWith(`COPY ${table} (`) && l.includes("FROM stdin;"),
  )
  if (start === -1) return []

  const header = lines[start]
  const cols = header
    .slice(header.indexOf("(") + 1, header.indexOf(")"))
    .split(",")
    .map((c) => c.trim())

  const rows: Record<string, string | null>[] = []
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i] === "\\.") break
    if (lines[i] === "") continue
    const fields = lines[i].split("\t")
    const row: Record<string, string | null> = {}
    cols.forEach((c, idx) => {
      row[c] = decodeField(fields[idx] ?? "\\N")
    })
    rows.push(row)
  }
  return rows
}

/** pg_dump emits `timestamp(3)` without a zone; Prisma stores UTC, so read it
 *  back as UTC ('2026-02-09 17:04:34.273' → '…T…Z'). */
function parsePgTimestamp(s: string): Date {
  return new Date(`${s.replace(" ", "T")}Z`)
}

export function parseInviteCodes(sql: string): InviteCodeRecord[] {
  return parseCopyBlock(sql, "public.invite_codes").map((r) => ({
    id: r.id!,
    code: r.code!,
    description: r.description,
    isActive: r.is_active === "t",
    createdAt: parsePgTimestamp(r.created_at!),
    parentCodeId: r.parent_code_id,
    ownerTaprootAddress: r.owner_taproot_address,
  }))
}

export function parseRedemptions(sql: string): RedemptionRecord[] {
  return parseCopyBlock(sql, "public.invite_code_redemptions").map((r) => ({
    id: r.id!,
    codeId: r.code_id!,
    taprootAddress: r.taproot_address!,
    segwitAddress: r.segwit_address,
    taprootPubkey: r.taproot_pubkey,
    redeemedAt: parsePgTimestamp(r.redeemed_at!),
    updatedAt: r.updated_at ? parsePgTimestamp(r.updated_at) : null,
  }))
}

/** Order codes so every parent precedes its children (self-FK safe). A code
 *  whose parent isn't in the set is treated as a root. */
export function topoSortCodes(codes: InviteCodeRecord[]): InviteCodeRecord[] {
  const byId = new Map(codes.map((c) => [c.id, c]))
  const emitted = new Set<string>()
  const out: InviteCodeRecord[] = []

  const visit = (c: InviteCodeRecord) => {
    if (emitted.has(c.id)) return
    const parent = c.parentCodeId ? byId.get(c.parentCodeId) : undefined
    if (parent && !emitted.has(parent.id)) visit(parent)
    emitted.add(c.id)
    out.push(c)
  }

  for (const c of codes) visit(c)
  return out
}

// --- DB load (idempotent) --------------------------------------------------

type LoaderClient = Pick<PrismaClient, "inviteCode" | "inviteCodeRedemption">

export interface LoadResult {
  codes: number
  redemptions: number
  orphaned: number
}

/** Upsert codes parent-first, then bulk-insert redemptions (skipping any whose
 *  code is missing). Idempotent: codes upsert by id, redemptions skipDuplicates. */
export async function loadReferralData(
  prisma: LoaderClient,
  data: { codes: InviteCodeRecord[]; redemptions: RedemptionRecord[] },
  opts: { batchSize?: number } = {},
): Promise<LoadResult> {
  const batchSize = opts.batchSize ?? 1000

  const ordered = topoSortCodes(data.codes)
  for (const c of ordered) {
    await prisma.inviteCode.upsert({
      where: { id: c.id },
      create: {
        id: c.id,
        code: c.code,
        description: c.description,
        isActive: c.isActive,
        createdAt: c.createdAt,
        parentCodeId: c.parentCodeId,
        ownerTaprootAddress: c.ownerTaprootAddress,
      },
      update: {
        code: c.code,
        description: c.description,
        isActive: c.isActive,
        parentCodeId: c.parentCodeId,
        ownerTaprootAddress: c.ownerTaprootAddress,
      },
    })
  }

  const codeIds = new Set(data.codes.map((c) => c.id))
  const valid = data.redemptions.filter((r) => codeIds.has(r.codeId))
  const orphaned = data.redemptions.length - valid.length

  let redemptions = 0
  for (let i = 0; i < valid.length; i += batchSize) {
    const chunk = valid.slice(i, i + batchSize)
    await prisma.inviteCodeRedemption.createMany({ data: chunk, skipDuplicates: true })
    redemptions += chunk.length
  }

  return { codes: ordered.length, redemptions, orphaned }
}
