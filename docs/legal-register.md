# Legal register — OYL deserters, funded-investor obligations & Subfrost legal

New admin surface for the OYL wind-down absorption + Subfrost legal record. Built
on the existing financials patterns (Prisma store → gated server action → client
manager). See the matching IAM tiers in `lib/cms/iam/registry.ts`.

## What shipped

| Surface | Route | Gated on |
|---|---|---|
| Legal entities list | `/admin/legal` | `legal.view` (edit: `legal.edit`) |
| Entity profile (FUEL-style) | `/admin/legal/entities/[id]` | `legal.view` |
| Deserter SAFEs subtab | `/admin/financials/safes` → "Deserter SAFEs" tab | `financials.view` to open SAFEs; the subtab needs `legal.view` |
| Invoice ↔ on-chain reconciliation | `/admin/financials/reconciliation` | **`legal.* AND financials.*`** (a tier of each) |

### IAM tiers (all RESTRICTED — not auto-granted to ADMIN)
- `legal.view` ⊂ `legal.edit` ⊂ `legal.superuser`
- `financials.view` ⊂ `financials.edit` ⊂ `financials.superuser` (existing `financials.view` gate unchanged)

Grant per-user in `/admin/users`. The reconciliation view enforces the AND in
the page via `hasLegalAndFinancials()` (`lib/financials/legal/privilege.ts`).

### Data model (`prisma/schema.prisma`)
- `LegalEntity` — the profile hub. `category` ∈ FUNDED_INVESTOR · DESERTER ·
  VOID_NONFUNDER · COUNTERPARTY · EMPLOYEE; `scope` ∈ SUBFROST · OYL. Loose refs
  to `User`/`Payee`/`Shareholder`.
- `LegalAgreement` — agreements per entity (SAFE, NDA, advisor, integration, …).
- `Deserter` (1:1) — OYL insider allocation → Subfrost equity swap → DIESEL, with
  `desertedVest`, `swapStatus`, and `arcaSignedOff`/`alecSignedOff`.
- `OylObligation` (1:1) — funded-investor DIESEL owed/claimable + on-chain settle.

DIESEL formula (canonical): `(purchase ÷ cap) × 0.5 × 440,000`. In
`lib/financials/legal/shapes.ts` as `dieselFromSafe()`.

## Apply to a database

No migration history exists in this repo (the project uses `prisma db push`).

```bash
# 1. push the new models
DATABASE_URL=… pnpm db:push          # or: npx prisma migrate dev --name legal_register

# 2. seed all buckets from the corrected OYL/Subfrost corpus (idempotent)
DATABASE_URL=… node scripts/seed-oyl-legal.mjs

# 3. grant yourself access (in /admin/users, or via the bootstrap endpoint):
#    add privileges: legal.superuser, financials.superuser
```

Seed source: `oyl-dump/make_diesel_doc.py` (26 funded investors, 36,447 DIESEL).
Arca is the #1 **funded** investor (11,000 DIESEL) — not a deserter. Deserters
are OYL internal team allocations (Kevin Yao, Dee, Ray, …).
