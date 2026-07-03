// Exercises loadEntityDossier aggregation (invoices/payments via the linked
// Payee, e-sign version chains, signed files, on-chain BTC+ETH, FUEL address
// join) against a Prisma mock, plus the explorer URL helpers. Mirrors the
// prisma-mock style of tests/documents/esign-store.test.ts. The vitest config
// sets mockReset:true, so mock implementations are (re)wired in beforeEach.
import { describe, it, expect, vi, beforeEach } from "vitest"

const D = (s: string) => new Date(s)

// ---- seed data ----
const ENTITY = {
  id: "ent1", name: "Acme Corp", kind: "ORG", category: "COUNTERPARTY", scope: "SUBFROST",
  email: "legal@acme.io", userId: null, payeeId: "pay1", shareholderId: null, notes: "key vendor",
  tags: ["vip", "oyl"], addresses: ["addrBTC1", "addrEVM1"], createdAt: D("2026-01-01"),
  deserter: null,
  obligation: {
    id: "ob1", entityId: "ent1", funding: "FUNDED", purchaseUsd: 50000, valuationCap: 20000000,
    dieselOwed: 100, dieselClaimable: 25, onchainTxid: "0xETHTX", onchainAddress: "0xabc",
    fundedAt: D("2026-02-01"), vestingNote: null, notes: null,
  },
  _count: { agreements: 0 },
}
const PAYEE = {
  id: "pay1", name: "Acme Corp", type: "ORG", kycIntakeId: null, notes: null, userId: null,
  agreementUrl: null, createdAt: D("2026-01-01"), kycIntake: null, user: null,
}
const INVOICES = [
  { id: "inv1", ref: "INV-1", payeeId: "pay1", description: "svc", amountUsd: 1000, amountDiesel: null,
    issuedAt: D("2026-03-01"), status: "PAID", pdfUrl: null, createdAt: D("2026-03-01"), payee: { name: "Acme Corp" } },
]
// listPayments() — global; dp1 settles inv1, dp0 settles a foreign invoice.
const ALL_PAYMENTS = [
  { id: "dp1", txid: "btctx1", vout: 0, amountDiesel: 50, recipientAddress: "addrBTC1", paidAt: D("2026-03-05"),
    blockHeight: 100, invoiceId: "inv1", source: "ONCHAIN", createdAt: D("2026-03-05"), invoice: { ref: "INV-1" } },
  { id: "dp0", txid: "btctxFOREIGN", vout: 0, amountDiesel: 9, recipientAddress: "someoneElse", paidAt: D("2026-03-06"),
    blockHeight: 101, invoiceId: "invX", source: "ONCHAIN", createdAt: D("2026-03-06"), invoice: { ref: "INV-X" } },
]
// address-matched: dp1 (dup — should dedupe) + dp2 (new, unlinked).
const ADDR_PAYMENTS = [
  { id: "dp1", txid: "btctx1", vout: 0, amountDiesel: 50, recipientAddress: "addrBTC1", paidAt: D("2026-03-05"),
    blockHeight: 100, invoiceId: "inv1", source: "ONCHAIN", createdAt: D("2026-03-05") },
  { id: "dp2", txid: "btctx2", vout: null, amountDiesel: 25, recipientAddress: "addrBTC1", paidAt: D("2026-04-01"),
    blockHeight: 120, invoiceId: null, source: "ONCHAIN", createdAt: D("2026-04-01") },
]
const FUEL = [
  { id: "f1", address: "addrBTC1", amount: 100, note: "kunteng", createdAt: D("2026-01-01"), updatedAt: D("2026-01-01") },
  { id: "f2", address: "addrEVM1", amount: 50, note: null, createdAt: D("2026-01-01"), updatedAt: D("2026-01-01") },
]
const ENTITY_ENVELOPES = [
  { id: "env2", subject: "Master Services Agreement", kind: "nda", status: "completed", version: 2,
    agreementKey: "agr1", createdAt: D("2026-05-02"), completedAt: D("2026-05-03") },
  { id: "env1", subject: "Master Services Agreement", kind: "nda", status: "voided", version: 1,
    agreementKey: "agr1", createdAt: D("2026-05-01"), completedAt: null },
  { id: "env3", subject: "", kind: "other", status: "sent", version: 1,
    agreementKey: null, createdAt: D("2026-06-01"), completedAt: null },
]
const FILE_LINKS = [
  { id: "link1", role: "SIGNATORY", annotation: "countersigned", file: { id: "file1", name: "contract.pdf", scope: "SUBFROST" } },
  { id: "link2", role: "SUBJECT", annotation: null, file: { id: "file2", name: "memo.pdf", scope: "SUBFROST" } },
]

vi.mock("@/lib/prisma", () => {
  const model = () => ({ findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() })
  const client = {
    legalEntity: model(), legalAgreement: model(), user: model(), shareholder: model(),
    payee: model(), invoice: model(), dieselPayment: model(), fuelAllocation: model(), envelope: model(),
  }
  return { prisma: client, default: client }
})
vi.mock("@/lib/files/manager", () => ({ listEntityFiles: vi.fn() }))

import prisma from "@/lib/prisma"
import { listEntityFiles } from "@/lib/files/manager"
import { loadEntityDossier } from "@/lib/financials/legal/store"
import { explorerTxUrl, explorerAddrUrl } from "@/lib/explorers"

type Fn = ReturnType<typeof vi.fn>
const p = prisma as unknown as Record<string, Record<string, Fn>>

// (re)wire mock implementations — mockReset:true wipes them before each test.
beforeEach(() => {
  p.legalEntity.findUnique.mockResolvedValue(ENTITY)
  p.legalAgreement.findMany.mockResolvedValue([])
  p.user.findMany.mockResolvedValue([])
  p.shareholder.findMany.mockResolvedValue([])
  p.payee.findMany.mockResolvedValue([{ id: "pay1", name: "Acme Corp" }])
  p.payee.findUnique.mockResolvedValue(PAYEE)
  p.invoice.findMany.mockResolvedValue(INVOICES)
  p.dieselPayment.findMany.mockImplementation(async (args?: { where?: { recipientAddress?: { in?: string[] } } }) =>
    args?.where?.recipientAddress?.in ? ADDR_PAYMENTS : ALL_PAYMENTS)
  p.fuelAllocation.findMany.mockResolvedValue(FUEL)
  p.envelope.findMany.mockImplementation(async (args?: { where?: { entityId?: string; payeeId?: string } }) =>
    args?.where?.entityId ? ENTITY_ENVELOPES : [])
  ;(listEntityFiles as Fn).mockResolvedValue(FILE_LINKS)
})

describe("explorer URL helpers", () => {
  it("builds tx URLs per chain", () => {
    expect(explorerTxUrl("bitcoin", "abc")).toBe("https://mempool.space/tx/abc")
    expect(explorerTxUrl("ethereum", "0xdeadbeef")).toBe("https://etherscan.io/tx/0xdeadbeef")
    expect(explorerTxUrl("bsc", "0xfeed")).toBe("https://bscscan.com/tx/0xfeed")
    expect(explorerTxUrl("espo", "espotx")).toContain("/tx/espotx")
  })
  it("builds address URLs per chain", () => {
    expect(explorerAddrUrl("bitcoin", "bc1qxyz")).toBe("https://mempool.space/address/bc1qxyz")
    expect(explorerAddrUrl("ethereum", "0xabc")).toBe("https://etherscan.io/address/0xabc")
    expect(explorerAddrUrl("bsc", "0xabc")).toBe("https://bscscan.com/address/0xabc")
  })
})

describe("loadEntityDossier", () => {
  let d: NonNullable<Awaited<ReturnType<typeof loadEntityDossier>>>
  beforeEach(async () => {
    const res = await loadEntityDossier("ent1")
    expect(res).not.toBeNull()
    d = res!
  })

  it("carries identity qualifiers, tags and addresses", () => {
    expect(d.entity.name).toBe("Acme Corp")
    expect(d.entity.payeeName).toBe("Acme Corp")
    expect(d.tags).toEqual(["vip", "oyl"])
    expect(d.addresses).toEqual(["addrBTC1", "addrEVM1"])
  })

  it("aggregates invoices + payments via the linked payee", () => {
    expect(d.payee).not.toBeNull()
    expect(d.payee!.invoices.map((i) => i.ref)).toEqual(["INV-1"])
    // only dp1 settles this payee's invoice; the foreign dp0 is filtered out
    expect(d.payee!.payments.map((x) => x.id)).toEqual(["dp1"])
    expect(d.payee!.totals.totalUsd).toBe(1000)
  })

  it("groups e-sign envelopes into per-agreement version chains (newest first)", () => {
    expect(d.docGroups).toHaveLength(2)
    const agr = d.docGroups.find((g) => g.key === "agr1")!
    expect(agr.versions.map((v) => v.version)).toEqual([2, 1])
    expect(agr.label).toBe("Master Services Agreement")
    expect(agr.versions[0].href).toBe("/admin/documents/env2")
    const solo = d.docGroups.find((g) => g.key === "env3")!
    expect(solo.versions).toHaveLength(1)
    expect(solo.label.length).toBeGreaterThan(0) // falls back to kind label
  })

  it("keeps only SIGNATORY/COUNTERPARTY files as signed docs", () => {
    expect(d.signedFiles).toHaveLength(1)
    expect(d.signedFiles[0].role).toBe("SIGNATORY")
    expect(d.signedFiles[0].name).toBe("contract.pdf")
  })

  it("builds on-chain rows for BTC payments (deduped) + the ETH obligation", () => {
    const eth = d.onchain.find((t) => t.source === "OYL_OBLIGATION")!
    expect(eth.chain).toBe("ethereum")
    expect(eth.txUrl).toBe("https://etherscan.io/tx/0xETHTX")
    const btc = d.onchain.filter((t) => t.source === "DIESEL_PAYMENT")
    expect(btc.map((t) => t.txid).sort()).toEqual(["btctx1", "btctx2"]) // dp1 deduped
    expect(btc.every((t) => t.txUrl.startsWith("https://mempool.space/tx/"))).toBe(true)
    expect(d.onchain).toHaveLength(3)
  })

  it("joins FUEL allocations by address and totals them", () => {
    expect(d.fuel.map((f) => f.address)).toEqual(["addrBTC1", "addrEVM1"])
    expect(d.fuelTotal).toBe(150)
    expect(d.fuel[0].addrUrl).toBe("https://mempool.space/address/addrBTC1")
  })

  it("returns null for an unknown entity", async () => {
    p.legalEntity.findUnique.mockResolvedValueOnce(null)
    expect(await loadEntityDossier("nope")).toBeNull()
  })
})
