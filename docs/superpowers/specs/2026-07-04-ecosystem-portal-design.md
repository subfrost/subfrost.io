# Alkanes Ecosystem Portal (`/ecosystem`) — Design

**Date:** 2026-07-04 · **Requested by:** flex + community (Misha discussion) · **Owner:** Vitor (CMO)

## Problem

The Alkanes community has users, but they can't find the projects. There is no single
place that lists what's being built on Alkanes. The ask (verbatim from the group): a
portal "similar to eth's defillama" — one page gathering all projects being built on
Alkanes (fire vault, alkapost, alkamon, pizza fun, misha's lottery, fairmint, …), each
with a brief introduction and its URL, so community members can discover and enter the
ecosystem, and so builders want to be listed to receive community traffic.

## Decisions (validated with Vitor, 2026-07-04)

1. **Management:** admin CRUD (Prisma model + `/admin/ecosystem` screen, IAM-gated).
   Not a static list; no public submission form in v1.
2. **URL:** `subfrost.io/ecosystem`.
3. **Scope v1:** pure directory (no per-project on-chain metrics).
4. **Seed:** Claude researches the ecosystem and seeds initial projects; team reviews
   in the admin before announcing.
5. **i18n model:** single model with per-locale columns (`descriptionEn`/`descriptionZh`),
   not a translation table — descriptions are 1-2 sentences.

## Schema (Prisma — fully additive, safe `db push`)

```prisma
model EcosystemProject {
  id            String   @id @default(cuid())
  slug          String   @unique          // kebab-case, upsert key for seeding
  name          String
  logoUrl       String?                   // GCS URL (subfrost-cms), fallback = monogram
  category      String                    // validated in code against ECOSYSTEM_CATEGORIES
  status        String   @default("Live") // validated: Live | Beta | Building
  url           String                    // project website (external)
  xUrl          String?                   // X/Twitter profile
  docsUrl       String?
  descriptionEn String   @default("")
  descriptionZh String   @default("")
  featured      Boolean  @default(false)  // pinned to top
  sortOrder     Int      @default(0)      // secondary ordering, then name asc
  published     Boolean  @default(false)  // hidden from public page until true
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([published, featured, sortOrder])
}
```

- `category` and `status` are **strings validated in server actions** against curated
  TS constants (`lib/ecosystem/constants.ts`), not Postgres enums — adding a category
  is a code-only change, no migration.
- `ECOSYSTEM_CATEGORIES`: `DeFi`, `Gaming`, `Social`, `Launchpad`, `NFT`, `Tooling`,
  `Wallet`, `Other`.

## IAM + Admin

- New privileges in `lib/cms/iam/registry.ts`: `ecosystem.view` and `ecosystem.edit`
  (`edit` implies `view`), new category `ecosystem` ("Ecosystem") — same precedent as
  the `tasks` board.
- `/admin/ecosystem`: table of projects (name, category, status, published/featured
  toggles, sort order) + create/edit form.
  - Logo upload reuses the existing admin GCS upload route (`kind` prefix
    `ecosystem/`), same as article inline images.
  - **"Translate EN→ZH" button**: server action reusing the `lib/cms/translate.ts`
    pattern (Anthropic SDK; `ANTHROPIC_API_KEY` already a cluster secret) to fill
    `descriptionZh` from `descriptionEn`.
  - Delete = hard delete with confirm dialog (directory data, no history needed).
- Nav entry in `lib/cms/admin-nav.ts` gated by `ecosystem.view`.

## Public page `/ecosystem`

- Server component, `force-dynamic` (same as `/data`); reads
  `EcosystemProject where published=true`, ordered `featured desc, sortOrder asc, name asc`.
- Locale: same mechanism as `/data` — `?lang=zh` searchParams, default `en`; inline
  `copy = { en, zh }` dictionary for chrome strings. Description falls back to EN when
  `descriptionZh` is empty.
- Layout (frost/dark theme, same finish level as `/data`, `EditorialShell` chrome):
  - Hero: title ("The Alkanes ecosystem" / 中文), one-line pitch ("Discover the
    projects being built on Alkanes — smart contracts on Bitcoin."), project count.
  - Category filter chips (All + categories present in data) — client-side filter,
    no page reload.
  - Card grid (responsive, ~3 cols desktop / 1 col mobile): logo (or gradient
    monogram fallback), name, status badge (Live/Beta/Building), category tag,
    description, external links (Website / X / Docs). Whole card links to `url`
    (new tab, `rel="noopener noreferrer"`); X/Docs are separate small buttons.
  - Footer CTA: "Building on Alkanes? Get listed →" linking to SUBFROST's X profile
    (DM). No form in v1.
- SEO: `generateMetadata` with title/description/OG + canonical/`languages`
  alternates (same shape as `/data`), entries in `app/sitemap.ts` for `/ecosystem`
  and `/ecosystem?lang=zh` (`changeFrequency: weekly, priority 0.7`).
- Locale middleware: add `/ecosystem` to `isEditorialLocalePath()` in
  `middleware.ts` so Chinese-market visitors get the ZH auto-redirect + cookie
  memory, same as `/`, `/data` and `/articles`.
- Site nav (unlike `/data`, which is soft-launched with no links): add an
  "Ecosystem" link to `components/StickyNav.tsx` (next to Articles) and to the
  resources group in `components/Footer.tsx`. The portal's whole purpose is
  discoverability; announcement timing is controlled by when the team shares the
  link, not by hiding it from the site.

## Seed

- Research (web) of the named projects — fire vault, alkapost, alkamon, pizza fun,
  misha's lottery, fairmint — plus other live Alkanes projects (wallets, DEXes,
  explorers, infra); SUBFROST itself included. Per project: name, URL (verified to
  resolve), X, optional docs, 1-2 sentence EN description + ZH translation, category,
  status. No invented URLs — anything unverifiable is left out or flagged.
- `scripts/seed-ecosystem.ts`: idempotent upsert-by-slug from a committed JSON list;
  run in-pod after deploy (base64 + prisma client pattern). Seeded entries land
  `published: true` so the page has content immediately. Since the nav links the
  page from day one, the team review in the admin happens right after the seed runs
  (same day), before the link is blasted to communities.
- Logos best-effort: fetched from project sites where clean, uploaded to GCS
  `ecosystem/`; missing logos use the monogram fallback.

## Out of scope (v1) — candidates for v2

- Public "submit your project" form + approval queue in admin.
- Per-project on-chain metrics (holders, activity — could reuse OP_RETURN/snapshot infra).
- Per-project detail pages (`/ecosystem/[slug]`); cards link out directly.

## Testing & rollout

- Vitest: server actions (IAM gating deny/allow, category/status validation, URL
  validation http(s)-only), locale fallback logic, public query ordering/filtering
  (mock prisma — local mock pattern beats global, per house precedent).
- Gates: `tsc` clean; `CI=true pnpm vitest run` with only the 4 known allow-listed
  failures; build compiles (Windows standalone EPERM is expected local noise; CI is
  the gate).
- Flow: worktree `wt-ecosystem` (branch `feat/ecosystem-portal`) → PR → CI green →
  merge → `prisma db push` additive → deploy bump (`newTag` quoted, full-SHA) →
  Flux annotate (source before kustomization) → rollout status → verify in prod:
  `/ecosystem` EN + `?lang=zh`, admin CRUD, translate button, logo upload.
