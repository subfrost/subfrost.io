/**
 * Admin-only referral-graph operations: list/create/edit/toggle/delete codes,
 * the hierarchy tree, and redemption listing/export. The public service path
 * (validate/redeem/lookup) lives in `./codes`; this module is reached only
 * through `actions/cms/codes.ts`, which gates every call on the
 * `MANAGE_REFERRAL_CODES` privilege. Ported from subfrost-app's
 * `app/api/admin/codes/*` + `app/api/admin/redemptions/*`.
 */
import crypto from "crypto"
import prisma from "@/lib/prisma"
import { normalizeCode, invalidateCodeValidation } from "@/lib/referral/codes"

/** Domain-level rejection (bad input, duplicate, not found). Server actions map
 *  this to an `{ ok: false, error }` envelope; anything else is a 500. */
export class CodeError extends Error {}

const DEFAULT_LIMIT = 25
const MAX_LIMIT = 1000

export interface ListCodesQuery {
  search?: string
  status?: string // 'all' | 'active' | 'inactive'
  page?: number
  limit?: number // 0 = unbounded (used to populate the parent-code picker)
  sortBy?: string // '' | code | description | redemptions | children | parent
  sortDir?: string // 'asc' | 'desc'
}

export interface CodeRow {
  id: string
  code: string
  description: string | null
  isActive: boolean
  ownerTaprootAddress: string | null
  createdAt: string
  parentCode: { id: string; code: string } | null
  redemptionCount: number
  childCount: number
}

export interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface ListCodesResult {
  codes: CodeRow[]
  pagination: Pagination
}

export async function listCodes(query: ListCodesQuery = {}): Promise<ListCodesResult> {
  const search = query.search?.trim() ?? ""
  const status = query.status ?? "all"
  const page = Math.max(1, query.page ?? 1)
  const rawLimit = query.limit ?? DEFAULT_LIMIT
  const limit = rawLimit === 0 ? undefined : Math.min(MAX_LIMIT, Math.max(1, rawLimit))
  const skip = limit ? (page - 1) * limit : 0

  const where: Record<string, unknown> = {}
  if (search) {
    where.OR = [
      { code: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
      { ownerTaprootAddress: { contains: search, mode: "insensitive" } },
    ]
  }
  if (status === "active") where.isActive = true
  if (status === "inactive") where.isActive = false

  const sortDir = query.sortDir === "asc" ? "asc" : "desc"
  let orderBy: Record<string, unknown>
  switch (query.sortBy) {
    case "code":
      orderBy = { code: sortDir }
      break
    case "description":
      orderBy = { description: sortDir }
      break
    case "redemptions":
      orderBy = { redemptions: { _count: sortDir } }
      break
    case "children":
      orderBy = { childCodes: { _count: sortDir } }
      break
    case "parent":
      orderBy = { parentCode: { code: sortDir } }
      break
    default:
      orderBy = { createdAt: "desc" }
  }

  const [rows, total] = await Promise.all([
    prisma.inviteCode.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        _count: { select: { redemptions: true, childCodes: true } },
        parentCode: { select: { id: true, code: true } },
      },
    }),
    prisma.inviteCode.count({ where }),
  ])

  return {
    codes: rows.map((c) => ({
      id: c.id,
      code: c.code,
      description: c.description,
      isActive: c.isActive,
      ownerTaprootAddress: c.ownerTaprootAddress,
      createdAt: c.createdAt.toISOString(),
      parentCode: c.parentCode ? { id: c.parentCode.id, code: c.parentCode.code } : null,
      redemptionCount: c._count.redemptions,
      childCount: c._count.childCodes,
    })),
    pagination: {
      page,
      limit: limit ?? total,
      total,
      totalPages: limit ? Math.ceil(total / limit) : 1,
    },
  }
}

/** Active codes as { id, code } — feeds the create modal's parent picker. */
export async function getParentOptions(): Promise<{ id: string; code: string }[]> {
  const { codes } = await listCodes({ limit: 0, status: "active" })
  return codes.map((c) => ({ id: c.id, code: c.code }))
}

export interface CreateCodeInput {
  code: string
  description?: string | null
  parentCodeId?: string | null
  ownerTaprootAddress?: string | null
}

export async function createCode(input: CreateCodeInput): Promise<{ id: string; code: string }> {
  const code = normalizeCode(input.code ?? "")
  if (code.length < 3) throw new CodeError("Code must be at least 3 characters")

  if (await prisma.inviteCode.findUnique({ where: { code } })) {
    throw new CodeError("Code already exists")
  }

  return prisma.inviteCode.create({
    data: {
      code,
      description: input.description?.trim() || null,
      parentCodeId: input.parentCodeId || null,
      ownerTaprootAddress: input.ownerTaprootAddress?.trim() || null,
    },
  })
}

export interface BulkCreateInput {
  prefix: string
  count: number
  description?: string | null
  parentCodeId?: string | null
}

function randomSuffix(): string {
  return crypto.randomBytes(4).toString("hex").slice(0, 5).toUpperCase()
}

/** Generate `count` unique `PREFIX-XXXXX` codes (5 hex chars) and bulk-insert
 *  them, skipping any suffix that collides with an existing code. */
export async function bulkCreateCodes(
  input: BulkCreateInput,
): Promise<{ count: number; codes: string[] }> {
  const prefix = normalizeCode(input.prefix ?? "")
  if (prefix.length < 2) throw new CodeError("Prefix must be at least 2 characters")
  const count = Math.trunc(input.count)
  if (!Number.isFinite(count) || count < 1 || count > 500) {
    throw new CodeError("Count must be between 1 and 500")
  }

  const existing = new Set(
    (
      await prisma.inviteCode.findMany({
        where: { code: { startsWith: prefix } },
        select: { code: true },
      })
    ).map((c) => c.code),
  )

  const codes: string[] = []
  let attempts = 0
  while (codes.length < count && attempts < count * 20) {
    const candidate = `${prefix}-${randomSuffix()}`
    if (!existing.has(candidate)) {
      existing.add(candidate)
      codes.push(candidate)
    }
    attempts++
  }
  if (codes.length < count) {
    throw new CodeError("Could not generate enough unique codes; try a different prefix")
  }

  const created = await prisma.inviteCode.createMany({
    data: codes.map((code) => ({
      code,
      description: input.description?.trim() || null,
      parentCodeId: input.parentCodeId || null,
    })),
  })
  return { count: created.count, codes }
}

export interface UpdateCodeInput {
  description?: string | null
  isActive?: boolean
  ownerTaprootAddress?: string | null
}

/** A mainnet Taproot address: `bc1p` prefix (case-insensitive) and 62 chars. */
export function isTaprootAddress(address: string): boolean {
  return address.length === 62 && /^bc1p/i.test(address)
}

export async function updateCode(
  id: string,
  input: UpdateCodeInput,
): Promise<{ id: string; code: string; isActive: boolean }> {
  const data: Record<string, unknown> = {}
  if (input.description !== undefined) data.description = input.description?.trim() || null
  if (input.isActive !== undefined) data.isActive = input.isActive
  if (input.ownerTaprootAddress !== undefined) {
    const address = input.ownerTaprootAddress?.trim() || null
    if (address) {
      if (!isTaprootAddress(address)) throw new CodeError("Incorrect Taproot format")
      const other = await prisma.inviteCode.findFirst({
        where: { ownerTaprootAddress: { equals: address, mode: "insensitive" }, id: { not: id } },
        select: { id: true },
      })
      if (other) throw new CodeError("Address already owns different code")
    }
    data.ownerTaprootAddress = address
  }

  const updated = await prisma.inviteCode.update({ where: { id }, data })
  // A deactivated code must stop validating immediately.
  if (updated.isActive === false) await invalidateCodeValidation(updated.code)
  return updated
}

export async function deleteCode(id: string): Promise<{ code: string }> {
  const code = await prisma.inviteCode.findUnique({ where: { id } })
  if (!code) throw new CodeError("Code not found")
  await prisma.inviteCode.delete({ where: { id } }) // redemptions cascade
  await invalidateCodeValidation(code.code)
  return { code: code.code }
}

export interface AddAddressInput {
  codeId: string
  taprootAddress: string
}

/** Admin: associate a taproot address with a code by recording a redemption.
 *  Enforces the same two rules as owner-address editing: the address must be a
 *  valid Taproot address, and it must not already be tied to a *different* code
 *  — as either that code's owner or one of its redeemers. Re-adding an address
 *  already on this code is a no-op. */
export async function addAddressToCode(
  input: AddAddressInput,
): Promise<{ id: string; code: string }> {
  const address = input.taprootAddress.trim()
  if (!isTaprootAddress(address)) throw new CodeError("Incorrect Taproot format")

  const code = await prisma.inviteCode.findUnique({
    where: { id: input.codeId },
    select: { id: true, code: true },
  })
  if (!code) throw new CodeError("Code not found")

  // Already on this very code — nothing to do (avoids the unique-key violation).
  const existing = await prisma.inviteCodeRedemption.findUnique({
    where: { codeId_taprootAddress: { codeId: code.id, taprootAddress: address } },
    select: { id: true },
  })
  if (existing) return { id: existing.id, code: code.code }

  // Rule 2: can't already be associated with a different code — as its owner…
  const otherOwner = await prisma.inviteCode.findFirst({
    where: { ownerTaprootAddress: { equals: address, mode: "insensitive" }, id: { not: code.id } },
    select: { id: true },
  })
  if (otherOwner) throw new CodeError("Address already owns different code")

  // …or as a redeemer of one.
  const otherRedemption = await prisma.inviteCodeRedemption.findFirst({
    where: { taprootAddress: address, codeId: { not: code.id } },
    select: { id: true },
  })
  if (otherRedemption) throw new CodeError("Address already associated with different code")

  const redemption = await prisma.inviteCodeRedemption.create({
    data: { codeId: code.id, taprootAddress: address },
  })
  return { id: redemption.id, code: code.code }
}

// --- Hierarchy tree --------------------------------------------------------

export interface CodeTreeInputRow {
  id: string
  code: string
  description: string | null
  isActive: boolean
  ownerTaprootAddress: string | null
  parentCodeId: string | null
  redemptionCount: number
}

export interface CodeTreeNode extends CodeTreeInputRow {
  children: CodeTreeNode[]
}

/** Pure: assemble flat rows into a parent→children forest. A row whose parent
 *  isn't in the set surfaces as a root (defensive against partial fetches). */
export function buildCodeTree(rows: CodeTreeInputRow[]): CodeTreeNode[] {
  const nodes = new Map<string, CodeTreeNode>()
  for (const row of rows) nodes.set(row.id, { ...row, children: [] })

  const roots: CodeTreeNode[] = []
  for (const row of rows) {
    const node = nodes.get(row.id)!
    const parent = row.parentCodeId ? nodes.get(row.parentCodeId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

export async function getCodeTree(): Promise<CodeTreeNode[]> {
  const rows = await prisma.inviteCode.findMany({
    select: {
      id: true,
      code: true,
      description: true,
      isActive: true,
      ownerTaprootAddress: true,
      parentCodeId: true,
      _count: { select: { redemptions: true } },
    },
    orderBy: { createdAt: "asc" },
  })
  return buildCodeTree(
    rows.map((r) => ({
      id: r.id,
      code: r.code,
      description: r.description,
      isActive: r.isActive,
      ownerTaprootAddress: r.ownerTaprootAddress,
      parentCodeId: r.parentCodeId,
      redemptionCount: r._count.redemptions,
    })),
  )
}

// --- Annotated tree (referral dashboard) -----------------------------------

export interface AnnotatedCodeNode extends CodeTreeNode {
  ownerFuel: number | null // FUEL on the code's owner address, if any
  ownerRedeemed: boolean // did the owner redeem this very code?
  totalFuel: number // FUEL summed over every distinct address in this subtree:
  // the code's owner, all descendant owners, and every redeemer of the code and
  // its descendants (each address counted once).
  redeemerAddresses: string[] // addresses that redeemed this very code
  children: AnnotatedCodeNode[]
}

/** The hierarchy tree, plus per-node owner-FUEL, owner-redeemed, and aggregate
 *  subtree-FUEL. Powers the unified referral view (create/redeemed/FUEL
 *  annotations in one tree). */
export async function getAnnotatedCodeTree(): Promise<AnnotatedCodeNode[]> {
  const tree = await getCodeTree()

  // Distinct owner addresses across the whole forest.
  const owners = new Set<string>()
  const walk = (n: CodeTreeNode) => {
    if (n.ownerTaprootAddress) owners.add(n.ownerTaprootAddress)
    n.children.forEach(walk)
  }
  tree.forEach(walk)

  const [redemptions, ownerRedeemed] = await Promise.all([
    prisma.inviteCodeRedemption.findMany({ select: { codeId: true, taprootAddress: true } }),
    // code ids where the owner redeemed their own code
    prisma.$queryRaw<{ id: string }[]>`
      SELECT c.id FROM "InviteCode" c
      WHERE c."ownerTaprootAddress" IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM "InviteCodeRedemption" r
          WHERE r."codeId" = c.id AND r."taprootAddress" = c."ownerTaprootAddress"
        )`,
  ])

  // Redeemer addresses per code, and every address we need FUEL for.
  const redeemersByCode = new Map<string, string[]>()
  const fuelAddrs = new Set<string>(owners)
  for (const r of redemptions) {
    const arr = redeemersByCode.get(r.codeId)
    if (arr) arr.push(r.taprootAddress)
    else redeemersByCode.set(r.codeId, [r.taprootAddress])
    fuelAddrs.add(r.taprootAddress)
  }

  const fuelRows = fuelAddrs.size
    ? await prisma.fuelAllocation.findMany({
        where: { address: { in: [...fuelAddrs] } },
        select: { address: true, amount: true },
      })
    : []
  const fuelByAddr = new Map(fuelRows.map((f) => [f.address, f.amount]))
  const redeemedIds = new Set(ownerRedeemed.map((r) => r.id))

  // Distinct addresses in a node's subtree (its owner + redeemers, plus every
  // descendant's), memoized so each node's total is computed once.
  const subtreeAddrs = new Map<string, Set<string>>()
  const collect = (n: CodeTreeNode): Set<string> => {
    const addrs = new Set<string>()
    if (n.ownerTaprootAddress) addrs.add(n.ownerTaprootAddress)
    for (const a of redeemersByCode.get(n.id) ?? []) addrs.add(a)
    for (const c of n.children) for (const a of collect(c)) addrs.add(a)
    subtreeAddrs.set(n.id, addrs)
    return addrs
  }
  tree.forEach(collect)

  const annotate = (n: CodeTreeNode): AnnotatedCodeNode => ({
    ...n,
    ownerFuel: n.ownerTaprootAddress ? fuelByAddr.get(n.ownerTaprootAddress) ?? null : null,
    ownerRedeemed: redeemedIds.has(n.id),
    totalFuel: [...(subtreeAddrs.get(n.id) ?? [])].reduce(
      (sum, a) => sum + (fuelByAddr.get(a) ?? 0),
      0,
    ),
    redeemerAddresses: redeemersByCode.get(n.id) ?? [],
    children: n.children.map(annotate),
  })
  return tree.map(annotate)
}

export interface CodeRedeemer {
  address: string
  redeemedAt: string
  fuel: number | null
}

/** Redeemers of a single code (newest first) with their FUEL allocation. */
export async function getCodeRedeemers(codeId: string): Promise<CodeRedeemer[]> {
  const reds = await prisma.inviteCodeRedemption.findMany({
    where: { codeId },
    orderBy: { redeemedAt: "desc" },
    select: { taprootAddress: true, redeemedAt: true },
  })
  if (reds.length === 0) return []
  const addrs = [...new Set(reds.map((r) => r.taprootAddress))]
  const fuels = await prisma.fuelAllocation.findMany({
    where: { address: { in: addrs } },
    select: { address: true, amount: true },
  })
  const fuelByAddr = new Map(fuels.map((f) => [f.address, f.amount]))
  return reds.map((r) => ({
    address: r.taprootAddress,
    redeemedAt: r.redeemedAt.toISOString(),
    fuel: fuelByAddr.get(r.taprootAddress) ?? null,
  }))
}

// --- Redemptions -----------------------------------------------------------

export interface ListRedemptionsQuery {
  search?: string
  code?: string
  page?: number
  limit?: number
  sortBy?: string // '' | redeemedAt | updatedAt
  sortDir?: string
}

export interface RedemptionRow {
  id: string
  code: string
  codeDescription: string | null
  taprootAddress: string
  segwitAddress: string | null
  taprootPubkey: string | null
  redeemedAt: string
}

export interface ListRedemptionsResult {
  redemptions: RedemptionRow[]
  pagination: Pagination
}

export async function listRedemptions(
  query: ListRedemptionsQuery = {},
): Promise<ListRedemptionsResult> {
  const search = query.search?.trim() ?? ""
  const codeFilter = query.code ?? ""
  const page = Math.max(1, query.page ?? 1)
  const limit = Math.min(100, Math.max(1, query.limit ?? DEFAULT_LIMIT))
  const skip = (page - 1) * limit

  const where: Record<string, unknown> = {}
  if (search) {
    where.OR = [
      { taprootAddress: { contains: search, mode: "insensitive" } },
      { segwitAddress: { contains: search, mode: "insensitive" } },
      { code: { code: { contains: search, mode: "insensitive" } } },
    ]
  }
  if (codeFilter) where.code = { code: codeFilter }

  const sortDir = query.sortDir === "asc" ? "asc" : "desc"
  const orderBy: Record<string, unknown> =
    query.sortBy === "updatedAt" ? { updatedAt: sortDir } : { redeemedAt: sortDir }

  const [rows, total] = await Promise.all([
    prisma.inviteCodeRedemption.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: { code: { select: { code: true, description: true } } },
    }),
    prisma.inviteCodeRedemption.count({ where }),
  ])

  return {
    redemptions: rows.map((r) => ({
      id: r.id,
      code: r.code.code,
      codeDescription: r.code.description,
      taprootAddress: r.taprootAddress,
      segwitAddress: r.segwitAddress,
      taprootPubkey: r.taprootPubkey,
      redeemedAt: r.redeemedAt.toISOString(),
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  }
}

export interface CsvRedemption {
  id: string
  taprootAddress: string
  segwitAddress: string | null
  taprootPubkey: string | null
  redeemedAt: Date | string
  inviteCode: { code: string; description: string | null }
}

const csvEscape = (v: string | null): string => {
  if (!v) return ""
  return /[,"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

/** Pure CSV serializer for a redemption export. */
export function redemptionsToCsv(rows: CsvRedemption[]): string {
  const header =
    "id,code,code_description,taproot_address,segwit_address,taproot_pubkey,redeemed_at"
  const lines = rows.map((r) =>
    [
      r.id,
      r.inviteCode.code,
      csvEscape(r.inviteCode.description),
      r.taprootAddress,
      r.segwitAddress || "",
      r.taprootPubkey || "",
      new Date(r.redeemedAt).toISOString(),
    ].join(","),
  )
  return [header, ...lines].join("\n")
}

export async function exportRedemptionsCsv(): Promise<string> {
  const rows = await prisma.inviteCodeRedemption.findMany({
    orderBy: { redeemedAt: "desc" },
    include: { code: { select: { code: true, description: true } } },
  })
  return redemptionsToCsv(
    rows.map((r) => ({
      id: r.id,
      taprootAddress: r.taprootAddress,
      segwitAddress: r.segwitAddress,
      taprootPubkey: r.taprootPubkey,
      redeemedAt: r.redeemedAt,
      inviteCode: { code: r.code.code, description: r.code.description },
    })),
  )
}
