# Ecosystem: curated hero mosaic + first-party disclaimer suppression

**Date:** 2026-07-16
**Branch:** `feat/ecosystem-mosaic-curation`
**Author:** Claude (Opus 4.8) with Vitor

## Context

`/ecosystem` has two rough edges the curator (Vitor) wants fixed:

1. **The hero mosaic is not curable.** `HeroMosaic` receives the full published project
   list and shows the *first 16* by `featured → sortOrder → name` (`components/ecosystem/HeroMosaic.tsx`).
   Which logos appear is an accident of ordering, not a choice. Today that surfaces two
   description-less projects (ClockIn, METHANE) while ready ones (Surtur, Pizza.fun) sit at
   positions 17 and 20, off the mosaic.
2. **The third-party disclaimer shows on first-party profiles.** `EcosystemNotice`
   ("SUBFROST did not build, does not control, and has not audited these projects…") renders on
   *every* profile header (`components/ecosystem/EcosystemProfile.tsx:71`). On SUBFROST's own
   products it is self-contradictory — SUBFROST did build and does control DIESEL, frBTC, FIRE,
   and the SUBFROST app itself.

## Goals

1. The admin can pick exactly which projects appear in the hero mosaic.
2. The disclaimer disappears from the profiles of SUBFROST's own products, while staying on the
   directory (as a whole) and on every third-party profile.

## Non-goals

- Changing the featured band, the grid, or its ordering.
- Filling in the description-less cards (ClockIn/METHANE/CheekyB/FARTANE/TORTILLA) — that is a
  separate content pending item.
- A public submission form or any admin/data-model rework beyond the two changes below.

## Design

### Frente A — first-party disclaimer suppression (code-only, no schema)

The set of first-party products is small and stable, so it lives in code, not the DB.

- `lib/ecosystem/constants.ts`: add
  `export const FIRST_PARTY_SLUGS = new Set(["diesel", "frbtc", "fire", "subfrost"])`
  and `export const isFirstParty = (slug: string) => FIRST_PARTY_SLUGS.has(slug)`.
- `components/ecosystem/EcosystemProfile.tsx`: the header `<EcosystemNotice text={copy.disclaimer} />`
  renders only when `!isFirstParty(p.slug)` (the component already has `p.slug`).
- `app/ecosystem/page.tsx`: **unchanged** — the directory-level notice stays; it frames the
  directory as a whole, which is overwhelmingly third-party.

Adding/removing a first-party product later is a one-line change + deploy. If Vitor later wants
to toggle it per-project in the admin, it can graduate to a boolean like Frente B — out of scope now.

### Frente B — curated hero mosaic (schema + admin + render)

- **Schema** (`prisma/schema.prisma`): add `inMosaic Boolean @default(false)` to `EcosystemProject`.
  Additive, nullable-with-default → `prisma db push` is non-destructive (no data migration).
- **Public read** (`lib/ecosystem/public.ts`): add `inMosaic: boolean` to `PublicEcosystemProject`
  and select/map it in `getEcosystemDirectory`.
- **Render** (`app/ecosystem/page.tsx`): pass a filtered list to the mosaic —
  `<HeroMosaic projects={projects.filter((p) => p.inMosaic)} />`. The grid/directory keeps the
  full list. Ordering (featured → sortOrder → name) is inherited from the directory query.
- **Mosaic component** (`components/ecosystem/HeroMosaic.tsx`): keep the 16 cap; change the
  "looks sparse" guard from `marks.length < 8 → return null` to `marks.length === 0 → return null`.
  Curation replaces the automatic minimum; the curator decides how many.
- **Admin** (`/admin/ecosystem` project form + save action): add a **"Show in hero mosaic"**
  checkbox mirroring the existing `featured` toggle end-to-end (form field → action → create/update).
  Exact files confirmed in the plan.

### Data flow

```
getEcosystemDirectory(locale)
  → prisma.ecosystemProject.findMany({ where: { published: true }, orderBy: [...] })
  → map rows → PublicEcosystemProject[] (now includes inMosaic)

app/ecosystem/page.tsx
  → <EcosystemDirectory projects={projects} .../>            (full list, unchanged)
  → <HeroMosaic projects={projects.filter(p => p.inMosaic)} /> (curated subset, ≤16)

app/ecosystem/[slug]/page.tsx → <EcosystemProfile p .../>
  → header notice rendered iff !isFirstParty(p.slug)
```

### Initial content (post-deploy, in-pod, no PR)

Once the column exists in prod, set `inMosaic = true` on the initial 16 (= today's mosaic minus
ClockIn/METHANE plus Surtur/Pizza.fun):

`diesel, frbtc, subfrost, arbuzino, fire, espo, alkanex, alka-trade, aries, cheekyb,
dohm-finance, fairmints, fartane, sablital, surtur, pizza-fun`

Everything else stays `false`. Vitor re-curates from `/admin/ecosystem` afterward. Surtur keeps
the logo already on its ecosystem record (no logo change).

## Error handling / edge cases

- After `prisma db push`, all rows are `inMosaic=false` → the mosaic is empty and hides itself
  (no crash) until the in-pod seed runs immediately after. Brief and acceptable.
- Empty filtered list → `HeroMosaic` returns `null` (no layout hole; the hero column just collapses).
- `FIRST_PARTY_SLUGS` referencing a slug that does not exist is inert (never matches).

## Testing

- `HeroMosaic`: renders only `inMosaic` projects; returns null when the set is empty.
- Profile: `EcosystemNotice` absent for a first-party slug, present for a third-party slug.
- Directory page: directory-level notice still present.
- Admin: saving with the checkbox on/off persists `inMosaic`.
- Gates: `CI=true vitest run` (ecosystem suite), `tsc`, `eslint .` (0-delta), `pnpm build`.

## Deploy

- PR → review → merge to `origin/main`.
- GKE via Flux: bump `k8s/kustomization.yaml` `newTag` to the merge full-SHA (quoted), after
  polling the image in Artifact Registry.
- The deployment's `migrate` initContainer runs `prisma db push` → the `inMosaic` column lands.
- Then run the in-pod seed (prisma updateMany over the 16 slugs).

## Risks

- Additive column with default → safe migration, no downtime.
- No change to featured/grid/ordering, so existing behavior is untouched except the mosaic source
  and the first-party profile notice.
