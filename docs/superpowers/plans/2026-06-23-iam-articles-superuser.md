# IAM — Articles superuser tier (visualization) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the two-tier article-access model (base editor vs. superuser) explicit and one-click assignable in the admin IAM, without changing enforcement or the database.

**Architecture:** Pure display + UX change. (A) Relabel the existing `articles.write` / `articles.edit_any` privileges in the IAM registry so they read as "Articles editor" / "Articles superuser". (B) Add a small pure personas module and surface it as one-click preset buttons above the existing `PrivilegePicker` in the Add/Edit user modals. No Prisma migration, no new server action, no enforcement logic touched (the capability already exists and is enforced server-side in `lib/cms/article-write.ts`).

**Tech Stack:** Next.js 16 App Router, TypeScript, React 19, Vitest + @testing-library/react (happy-dom), Tailwind.

## Global Constraints

- **No Prisma migration** — do not touch `prisma/schema.prisma` or the `Role` enum (avoids conflict with the flex's open PR #76).
- **No enforcement change** — `articles.write` (own) / `articles.edit_any` (any) capabilities and their server-side checks already exist and are correct; do not modify gating logic.
- **Labels are display-only** — gating uses privilege *codes*, never label text. Codes, categories, and the `implies` graph stay unchanged.
- **Personas are additive** — applying a persona unions its (implies-expanded) privileges into the current selection, capped to `grantable`; it never clears existing grants.
- **You can't grant what you don't hold** — every persona action and button is capped/disabled against the actor's `grantable` set (mirrors `PrivilegePicker`).
- Windows + Git Bash. Verify gates: `npx tsc --noEmit` → 0, `CI=true npx vitest run` → green, `npx next build` → 0.
- branch→PR→merge (branch `feat/iam-articles-superuser` already created). Frequent commits.

---

### Task 1: Relabel the two article tiers in the IAM registry

**Files:**
- Modify: `lib/cms/iam/registry.ts:62-63`
- Test: `tests/cms/iam-registry.test.ts` (add one assertion)

**Interfaces:**
- Consumes: nothing.
- Produces: registry entries `articles.write` (label "Articles editor") and `articles.edit_any` (label "Articles superuser") with unchanged codes/`implies`. Later UI/tests read these labels via `PRIVILEGE_LABELS` / `privilegeDef`.

- [ ] **Step 1: Write the failing test**

Add to `tests/cms/iam-registry.test.ts` inside the `describe("IAM registry", ...)` block:

```ts
it("expresses the two article tiers (editor vs superuser) with stable codes", () => {
  const editor = privilegeDef("articles.write")
  const superuser = privilegeDef("articles.edit_any")
  expect(editor?.label).toBe("Articles editor")
  expect(superuser?.label).toBe("Articles superuser")
  // superuser still implies the base write capability (enforcement unchanged)
  expect(superuser?.implies).toContain("articles.write")
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npx vitest run tests/cms/iam-registry.test.ts`
Expected: FAIL — `expected 'Write articles' to be 'Articles editor'`.

- [ ] **Step 3: Edit the registry labels/descriptions**

In `lib/cms/iam/registry.ts`, replace the two article privilege lines (currently lines 62-63):

```ts
  { code: "articles.write", label: "Articles editor", description: "Create and edit only your own article drafts and submit them for review.", category: "articles", implies: [] },
  { code: "articles.edit_any", label: "Articles superuser", description: "Manage, edit, and delete any author's articles.", category: "articles", implies: ["articles.write"] },
```

(Leave `articles.publish` and `articles.edit_bio` exactly as they are.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `CI=true npx vitest run tests/cms/iam-registry.test.ts tests/cms/privileges.test.ts`
Expected: PASS (privileges.test.ts still green — it asserts labels are non-empty and bundle membership by code, neither of which changed).

- [ ] **Step 5: Commit**

```bash
git add lib/cms/iam/registry.ts tests/cms/iam-registry.test.ts
git commit -m "feat(iam): relabel article tiers as Articles editor / superuser

Display-only — codes and implies graph unchanged.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Pure personas module (`PERSONAS`, `applyPersona`, `personaGrantable`)

**Files:**
- Create: `lib/cms/iam/personas.ts`
- Test: `tests/cms/personas.test.ts`

**Interfaces:**
- Consumes: `expand`, `PrivilegeCode` from `@/lib/cms/iam/registry`.
- Produces:
  - `interface Persona { key: string; label: string; description: string; privileges: PrivilegeCode[] }`
  - `const PERSONAS: Persona[]` — two entries: `articles_editor` (`["articles.write"]`), `articles_superuser` (`["articles.edit_any"]`).
  - `applyPersona(current: string[], persona: Persona, grantable: string[]): PrivilegeCode[]` — additive union of the implies-expanded persona privileges (capped to `grantable`) with `current`, de-duped.
  - `personaGrantable(persona: Persona, grantable: string[]): boolean` — true iff every implies-expanded persona privilege is within `grantable`.

- [ ] **Step 1: Write the failing test**

Create `tests/cms/personas.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { PERSONAS, applyPersona, personaGrantable, type Persona } from "@/lib/cms/iam/personas"

const ALL = ["articles.write", "articles.edit_any", "articles.publish", "fuel.read"]
const byKey = (k: string) => PERSONAS.find((p) => p.key === k) as Persona

describe("PERSONAS", () => {
  it("defines the two article tiers", () => {
    expect(byKey("articles_editor").privileges).toEqual(["articles.write"])
    expect(byKey("articles_superuser").privileges).toEqual(["articles.edit_any"])
  })
})

describe("applyPersona", () => {
  it("superuser pulls in the implied base write capability", () => {
    const result = applyPersona([], byKey("articles_superuser"), ALL)
    expect(result).toContain("articles.edit_any")
    expect(result).toContain("articles.write") // via implies/expand
  })
  it("is additive — keeps unrelated existing grants and de-dupes", () => {
    const result = applyPersona(["fuel.read", "articles.write"], byKey("articles_editor"), ALL)
    expect(result).toContain("fuel.read")
    expect(result.filter((c) => c === "articles.write")).toHaveLength(1)
  })
  it("caps to grantable — drops privileges the actor can't grant", () => {
    const result = applyPersona([], byKey("articles_superuser"), ["articles.write"])
    expect(result).not.toContain("articles.edit_any")
  })
})

describe("personaGrantable", () => {
  it("false when an expanded privilege is outside grantable", () => {
    expect(personaGrantable(byKey("articles_superuser"), ["articles.write"])).toBe(false)
  })
  it("true when the full expanded set is grantable", () => {
    expect(personaGrantable(byKey("articles_superuser"), ALL)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npx vitest run tests/cms/personas.test.ts`
Expected: FAIL — cannot resolve `@/lib/cms/iam/personas`.

- [ ] **Step 3: Write the module**

Create `lib/cms/iam/personas.ts`:

```ts
// Convenience persona presets for the user editor: named bundles of privileges
// surfaced as one-click buttons next to the PrivilegePicker. Pure data + pure
// helpers (no React) so they're testable and reusable. The actual capability
// model and enforcement live in the registry + server actions — a persona is
// just a shortcut for selecting privilege codes.

import { expand, type PrivilegeCode } from "@/lib/cms/iam/registry"

export interface Persona {
  key: string
  label: string
  description: string
  privileges: PrivilegeCode[]
}

export const PERSONAS: Persona[] = [
  {
    key: "articles_editor",
    label: "Articles editor",
    description: "Edits only their own articles.",
    privileges: ["articles.write"],
  },
  {
    key: "articles_superuser",
    label: "Articles superuser",
    description: "Manages and edits any author's articles.",
    privileges: ["articles.edit_any"],
  },
]

/** Privileges a persona effectively grants (closed over the implies graph). */
function personaCodes(persona: Persona): PrivilegeCode[] {
  return expand(persona.privileges)
}

/** Merge a persona's privileges into a current selection: additive union of the
 *  implies-expanded codes (capped to `grantable`) with `current`, de-duped. */
export function applyPersona(current: string[], persona: Persona, grantable: string[]): PrivilegeCode[] {
  const grant = new Set(grantable)
  const add = personaCodes(persona).filter((c) => grant.has(c))
  return [...new Set([...current, ...add])]
}

/** True iff every privilege the persona grants is within `grantable` (you can't
 *  grant what you don't hold). Drives the button's disabled state. */
export function personaGrantable(persona: Persona, grantable: string[]): boolean {
  const grant = new Set(grantable)
  return personaCodes(persona).every((c) => grant.has(c))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `CI=true npx vitest run tests/cms/personas.test.ts`
Expected: PASS (all 6 assertions).

- [ ] **Step 5: Commit**

```bash
git add lib/cms/iam/personas.ts tests/cms/personas.test.ts
git commit -m "feat(iam): pure personas module (articles editor / superuser presets)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `PersonaQuickPick` component + wire into the user modals

**Files:**
- Create: `components/cms/PersonaQuickPick.tsx`
- Modify: `components/cms/UsersManager.tsx` (import + render in `AddUserModal` and `EditUserModal`, above the `PrivilegePicker`, only when `canManageRoles`)
- Test: `tests/cms/persona-quick-pick.test.tsx`

**Interfaces:**
- Consumes: `PERSONAS`, `applyPersona`, `personaGrantable` from `@/lib/cms/iam/personas`.
- Produces: `PersonaQuickPick({ value, onChange, grantable, disabled? }: { value: string[]; onChange: (codes: string[]) => void; grantable: string[]; disabled?: boolean })` — renders one button per persona; a button is disabled when `disabled` or `!personaGrantable(persona, grantable)`; click calls `onChange(applyPersona(value, persona, grantable))`.

- [ ] **Step 1: Write the failing test**

Create `tests/cms/persona-quick-pick.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from "vitest"
import { render, cleanup, fireEvent } from "@testing-library/react"
import { PersonaQuickPick } from "@/components/cms/PersonaQuickPick"

const ALL = ["articles.write", "articles.edit_any", "articles.publish"]

beforeEach(() => cleanup())

describe("PersonaQuickPick", () => {
  it("renders a button per persona", () => {
    const { getByText } = render(<PersonaQuickPick value={[]} onChange={() => {}} grantable={ALL} />)
    expect(getByText("Articles editor")).toBeTruthy()
    expect(getByText("Articles superuser")).toBeTruthy()
  })

  it("clicking 'Articles superuser' grants edit_any (+ implied write)", () => {
    const onChange = vi.fn()
    const { getByText } = render(<PersonaQuickPick value={[]} onChange={onChange} grantable={ALL} />)
    fireEvent.click(getByText("Articles superuser"))
    const next = onChange.mock.calls[0][0] as string[]
    expect(next).toContain("articles.edit_any")
    expect(next).toContain("articles.write")
  })

  it("disables a persona whose privilege isn't grantable", () => {
    const onChange = vi.fn()
    // actor can only grant articles.write → superuser persona is not grantable
    const { getByText } = render(<PersonaQuickPick value={[]} onChange={onChange} grantable={["articles.write"]} />)
    const btn = getByText("Articles superuser").closest("button")!
    expect(btn.disabled).toBe(true)
    fireEvent.click(btn)
    expect(onChange).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true npx vitest run tests/cms/persona-quick-pick.test.tsx`
Expected: FAIL — cannot resolve `@/components/cms/PersonaQuickPick`.

- [ ] **Step 3: Write the component**

Create `components/cms/PersonaQuickPick.tsx`:

```tsx
"use client"

import { PERSONAS, applyPersona, personaGrantable } from "@/lib/cms/iam/personas"

/** One-click persona presets shown above the PrivilegePicker. Clicking a persona
 *  additively merges its (implies-expanded, grantable-capped) privileges into the
 *  current selection. A persona is disabled when the actor can't grant all of it. */
export function PersonaQuickPick({
  value,
  onChange,
  grantable,
  disabled,
}: {
  value: string[]
  onChange: (codes: string[]) => void
  grantable: string[]
  disabled?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Quick personas</div>
      <div className="flex flex-wrap gap-2">
        {PERSONAS.map((p) => {
          const ok = personaGrantable(p, grantable)
          return (
            <button
              key={p.key}
              type="button"
              title={p.description}
              disabled={disabled || !ok}
              onClick={() => onChange(applyPersona(value, p, grantable))}
              className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-200 hover:border-sky-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              + {p.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=true npx vitest run tests/cms/persona-quick-pick.test.tsx`
Expected: PASS (3 assertions).

- [ ] **Step 5: Wire it into the user modals**

In `components/cms/UsersManager.tsx`:

1. Add the import near the other component imports (after the `PrivilegePicker` import, ~line 11):

```tsx
import { PersonaQuickPick } from "@/components/cms/PersonaQuickPick"
```

2. In `AddUserModal`, inside the `{canManageRoles && (...)}` block, render the quick-pick directly above the `<PrivilegePicker .../>` (so it becomes):

```tsx
            {canManageRoles && (
              <div className="space-y-1.5">
                <Label className="text-zinc-300">Privileges</Label>
                <PersonaQuickPick value={privileges} onChange={setPrivileges} grantable={grantable} />
                <PrivilegePicker value={privileges} onChange={setPrivileges} grantable={grantable} />
              </div>
            )}
```

3. In `EditUserModal`, in the `canManageRoles ? (...)` branch, add the quick-pick directly above the `<PrivilegePicker .../>` (so it becomes):

```tsx
        {canManageRoles ? (
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Privileges (beyond the {role} role bundle)</Label>
            <PersonaQuickPick value={privileges} onChange={setPrivileges} grantable={grantable} />
            <PrivilegePicker value={privileges} onChange={setPrivileges} grantable={grantable} />
          </div>
        ) : (
```

- [ ] **Step 6: Run the full gate (component test + typecheck)**

Run: `CI=true npx vitest run tests/cms/persona-quick-pick.test.tsx tests/cms/personas.test.ts tests/cms/users-actions.test.ts && npx tsc --noEmit`
Expected: PASS, tsc 0.

- [ ] **Step 7: Commit**

```bash
git add components/cms/PersonaQuickPick.tsx components/cms/UsersManager.tsx tests/cms/persona-quick-pick.test.tsx
git commit -m "feat(iam): one-click persona presets in the user modals

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Full verification gate

**Files:** none (verification only).

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0, no output.

- [ ] **Step 2: Full test suite**

Run: `CI=true npx vitest run`
Expected: green (no failures; the 3 new tests pass, all prior tests still pass).

- [ ] **Step 3: Production build**

Run: `npx next build`
Expected: exit 0, build completes.

- [ ] **Step 4: Confirm no schema / enforcement drift**

Run: `git diff --stat main -- prisma/schema.prisma lib/cms/article-write.ts`
Expected: empty output (neither file changed — capability and DB untouched).
