# IAM — Articles superuser tier (visualization) — Design

**Date:** 2026-06-23
**Status:** Approved (brainstorm)
**Branch:** `feat/iam-articles-superuser`

## Context

The flex asked for "an extra layer at IAM where we have the articles superuser
which can manage/edit other people's articles, but base permission for articles
editor just edits his own."

This capability **already exists** and is enforced server-side:

- `articles.write` — create/edit **only your own** drafts (enforced in
  `lib/cms/article-write.ts`: editing someone else's article requires
  `articles.edit_any`; same guard on delete and on the `/admin/articles` list).
- `articles.edit_any` — edit/delete **anyone's** articles (`implies`
  `articles.write`).
- `articles.publish` — publish/feature.

What's missing is **legibility**: in the IAM picker `articles.edit_any` reads as
"Edit any article", not as a clearly-named *superuser* tier, and there is no
one-click way to assign the tier. This is a **visualization / UX** change, per
the flex's request — the enforcement is untouched.

## Goal

Make the two-tier article access model explicit and one-click assignable in the
admin IAM, **without** a Prisma migration (avoids conflict with the flex's open
PR #76, which touches `schema.prisma` and the `Role` enum).

## Non-goals

- No new enforcement logic (the capability and its server-side checks already
  exist and are correct).
- No new `Role` enum value (would require a migration).
- No change to `articles.publish` semantics.
- Not building a general persona/RBAC-preset framework — only the two article
  personas the flex asked for, in a structure that can grow later.

## Design

### A) Relabel the two tiers in the registry (the core "visualization")

In `lib/cms/iam/registry.ts`, clarify the labels/descriptions so the tier is
self-evident wherever privileges are shown (the `PrivilegePicker` renders
`label` + `description` + an "also grants …" hint). Codes, categories, and the
`implies` graph are unchanged.

- `articles.write` → label **"Articles editor"**, description **"Create and edit
  only your own article drafts and submit them for review."**
- `articles.edit_any` → label **"Articles superuser"**, description **"Manage,
  edit, and delete any author's articles."** (keeps `implies: ["articles.write"]`).

No logic depends on label text (gating uses codes); existing IAM tests only
assert labels are non-empty, so this is display-only.

### B) Persona quick-pick presets in the Add/Edit user modals (the "extra layer")

Add a small, pure presets module and surface it as one-click buttons in the user
modals, so an operator can assign the tier without hunting in the picker.

- **New** `lib/cms/iam/personas.ts` (pure data + a pure merge helper, no React):
  ```ts
  export interface Persona { key: string; label: string; description: string; privileges: PrivilegeCode[] }
  export const PERSONAS: Persona[] = [
    { key: "articles_editor",    label: "Articles editor",    description: "Edits only their own articles.", privileges: ["articles.write"] },
    { key: "articles_superuser", label: "Articles superuser", description: "Manages and edits any author's articles.", privileges: ["articles.edit_any"] },
  ]
  /** Merge a persona's privileges (expanded over implies, capped to grantable) into a current selection. */
  export function applyPersona(current: string[], persona: Persona, grantable: string[]): string[]
  ```
  `applyPersona` reuses `expand()` from the registry and intersects with
  `grantable`, then unions with `current` (additive — never clears other grants).

- **UI** in `components/cms/UsersManager.tsx` (`AddUserModal` + `EditUserModal`):
  a "Quick personas" row above the `PrivilegePicker`, rendered only when
  `canManageRoles` (same condition the picker already uses). Each persona is a
  small button; it's **disabled** if any of its privileges aren't in
  `grantable` (you can't grant what you don't hold — mirrors the picker). Click →
  `setPrivileges(applyPersona(privileges, persona, grantable))`. The picker then
  reflects the merged selection (implied rows lock as usual).

### Data flow

Persona click → `applyPersona` (pure) → `setPrivileges` → existing
`PrivilegePicker` state → existing `provisionUser` / `updateUser` actions. No new
server action, no schema change, no change to how privileges are stored or
enforced.

## Error handling / edge cases

- Persona with an ungrantable privilege → button disabled (no partial grant).
- Persona is additive: clicking it never removes existing selections; removing is
  still done via the picker chips.
- `articles_superuser` pulls in `articles.write` via `expand()` (implies), so the
  effective grant is correct even though only `articles.edit_any` is listed.

## Testing

- **`tests/cms/personas.test.ts`** (pure): `applyPersona` expands implies, caps to
  `grantable`, is additive (keeps unrelated existing grants), and de-dupes.
- **Registry**: existing `iam-registry.test.ts` / `privileges.test.ts` stay green
  (labels still non-empty; bundles unchanged). Add an assertion that the two
  article codes still exist with the expected `implies`.
- **UI** (`tests/cms/users-manager-personas.test.tsx`, RTL): persona buttons
  render under `canManageRoles`; clicking "Articles superuser" results in a
  selection containing `articles.edit_any` (+ implied `articles.write`); a persona
  whose privilege isn't grantable renders disabled.

## Verification

`npx tsc --noEmit` 0 · `CI=true npx vitest run` green · `npx next build` 0.
Live (post-deploy): in `/admin/users`, Add/Edit user shows "Articles editor" /
"Articles superuser" quick personas; the picker shows the relabeled tiers.

## Rollout

branch → PR → merge → Cloud Build → bump `newTag` in `k8s/kustomization.yaml`
via PR → Flux. No migration. No new secret.
