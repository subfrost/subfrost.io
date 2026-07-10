# System notice / announcement — admin toggle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One admin-controlled site notice (subfrost.io/admin) that turns on/off and carries an editable title + message (EN + ZH), targeted to the app's banner, modal, or both — no PR per change. Replaces the hardcoded espo banner/modal in the app.

**Architecture:** The **site** owns the state (one `SystemNotice` Postgres row) + a gated admin card + a **public read API**. The **app** reads that API through a fail-safe server-side proxy and drives its (renamed) banner + modal from a `useSystemNotice` react-query hook. Cross-app coupling is one HTTP contract, not a shared table.

**Tech Stack:** Next.js (App Router) + Prisma/Postgres + vitest on both repos. Site: server actions, IAM privileges, Claude translation (`lib/cms/translate.ts`). App: `@tanstack/react-query` v5, `useTranslation`/`LanguageContext`.

## Global Constraints
- **Two repos, two PRs, SITE FIRST.** PR A = `C:\Alkanes Geral Dev\subfrost.io`. PR B = `C:\subfrost-app-pr` (fresh clone of `subfrost/subfrost-app`). The app's public read target must exist before PR B ships.
- **Manual only.** No health-check, no auto-expiry. One global notice (one row).
- **Fail-safe read on the app side.** Any proxy error → `{ enabled: false }`, HTTP 200 — never a render throw, never a false notice.
- **Cache ≤60s at every layer**, no CDN on `/api/system-notice`.
- **Keep the existing `sessionStorage` dismiss keys** (`sf-espo-down-dismissed`, `sf-demo-banner-dismissed`) — 6 e2e/puppeteer helpers pre-set them; rename components, not keys.
- **EN authored; ZH via `translate()`** (reuse the existing Claude Opus 4.8 helper — `ANTHROPIC_API_KEY` already in the site k8s secret). ZH optional; app falls back to EN when empty.
- **No em-dashes in any user-facing copy** (SUBFROST house rule).
- **Deploy:** PR A via Flux `newTag` bump (SHA in quotes); site schema applied by the `prisma db push --skip-generate` init container (additive, no migration files). PR B merged by Flex/Gabe → Cloud Run auto-deploy. **Enable the espo notice in the admin (PR A) before PR B ships**, or the live espo banner/modal blink off.
- **Site gate:** `pnpm tsc --noEmit` + `pnpm lint` + `pnpm vitest run` + `pnpm build` (3 pre-existing allow-listed failures: admin-nav / admin-landing / frbtc-indexer — filter them). **App gate:** `pnpm tsc --noEmit` + `pnpm lint` + `pnpm test:unit` + `pnpm build`.

## File Structure
**Site (subfrost.io):**
- Modify `prisma/schema.prisma` — add `SystemNotice` model.
- Modify `lib/cms/iam/registry.ts` — add `system.view`/`system.edit` privileges, `system` category, VIEW_GATE.
- Modify `lib/cms/admin-nav.ts` — add the "Site notice" nav leaf.
- Create `lib/cms/system-notice.ts` — `SystemNoticeDTO`, `getSystemNotice()`, `toNoticePayload()` (plain lib, no auth).
- Create `actions/admin/system-notice.ts` — `setSystemNotice`, `translateNoticeAction` (`"use server"`, gated).
- Create `app/api/system-notice/route.ts` — public GET.
- Create `app/admin/notice/page.tsx` — gated server page.
- Create `components/cms/notice/SystemNoticeCard.tsx` — the admin form (client).
- Create `tests/admin/system-notice.test.ts`, `tests/admin/system-notice-route.test.ts`.

**App (subfrost-app):**
- Create `app/api/system-notice/route.ts` — fail-safe proxy GET.
- Create `lib/systemNotice.ts` — `resolveNotice()` pure + `NoticePayload`/`ResolvedNotice` types.
- Create `hooks/useSystemNotice.ts` — react-query wrapper + locale resolution.
- Rename `app/components/EspoDownBanner.tsx` → `SystemNoticeBanner.tsx`; `app/components/DemoBanner.tsx` → `SystemNoticeModal.tsx`; drive both from the hook.
- Modify `app/components/AppShell.tsx` — update the two imports/mounts.
- Modify `i18n/en.ts`, `i18n/zh.ts` — remove espo/beta keys, rename `demo.understand` → `notice.understand`.
- Create `tests/system-notice-route.test.ts`, `tests/systemNotice.test.ts` (node env).

---

# PHASE A — subfrost.io (PR A)

Branch off fresh `origin/main` (`git worktree` or a clean checkout).

### Task A1: Model + privileges + nav (scaffolding)

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `lib/cms/iam/registry.ts`
- Modify: `lib/cms/admin-nav.ts`

**Interfaces:**
- Produces: Prisma model `SystemNotice`; privileges `system.view`, `system.edit`; nav leaf `/admin/notice`.

- [ ] **Step 1: Add the Prisma model** — append to `prisma/schema.prisma`:

```prisma
// One global, admin-controlled site notice (banner + modal). Singleton row id=1.
model SystemNotice {
  id         Int      @id @default(1)
  enabled    Boolean  @default(false)
  showBanner Boolean  @default(true)
  showModal  Boolean  @default(true)
  titleEn    String?
  messageEn  String?
  titleZh    String?
  messageZh  String?
  updatedAt  DateTime @updatedAt
  updatedBy  String?
}
```

- [ ] **Step 2: Regenerate the client + validate**

Run: `npx prisma generate && npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid` and a fresh client (so `prisma.systemNotice` is typed).

- [ ] **Step 3: Add the privileges** — in `lib/cms/iam/registry.ts`, add to `CATEGORIES[]`:

```ts
{ key: "system", label: "System" },
```
add to `PRIVILEGES[]`:

```ts
{ code: "system.view", label: "Site notice — view", description: "View the site notice / announcement control.", category: "system", implies: [] },
{ code: "system.edit", label: "Site notice — edit", description: "Turn the site notice on/off and edit its title/message.", category: "system", implies: ["system.view"] },
```
and add to `VIEW_GATES`:

```ts
"/admin/notice": { view: "system.view", edit: "system.edit" },
```

- [ ] **Step 4: Add the nav leaf** — in `lib/cms/admin-nav.ts`, import a `lucide-react` icon (e.g. `Megaphone`) and add to the `settings` group's `items`:

```ts
{ label: "Site notice", href: "/admin/notice", icon: Megaphone, privilege: "system.view" },
```

- [ ] **Step 5: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors (`prisma.systemNotice` resolves; registry/nav literals typecheck).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma lib/cms/iam/registry.ts lib/cms/admin-nav.ts
git commit -m "feat(admin): SystemNotice model + system.view/edit privileges + nav leaf"
```

---

### Task A2: Read lib + write/translate actions

**Files:**
- Create: `lib/cms/system-notice.ts`
- Create: `actions/admin/system-notice.ts`
- Test: `tests/admin/system-notice.test.ts`

**Interfaces:**
- Consumes: `prisma` (default import from `@/lib/prisma`), `currentUser` (`@/lib/cms/authz`), `translate` + `translationUnavailable` (`@/lib/cms/translate`), `revalidatePath` (`next/cache`).
- Produces:
  - `interface SystemNoticeDTO { enabled: boolean; showBanner: boolean; showModal: boolean; titleEn: string; messageEn: string; titleZh: string; messageZh: string; updatedAt: string | null; updatedBy: string | null }`
  - `getSystemNotice(): Promise<SystemNoticeDTO>` and `toNoticePayload(dto): { enabled, showBanner, showModal, en:{title,message}, zh:{title,message} }` in `lib/cms/system-notice.ts`.
  - `setSystemNotice(input): Promise<{ ok: boolean; error?: string }>` and `translateNoticeAction(input): Promise<{ ok: true; titleZh: string; messageZh: string } | { ok: false; error: string; unavailable?: boolean }>` in `actions/admin/system-notice.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/admin/system-notice.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/cms/authz", () => ({ currentUser: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/prisma", () => ({
  default: { systemNotice: { findUnique: vi.fn(), upsert: vi.fn() } },
}))
vi.mock("@/lib/cms/translate", () => ({
  translate: vi.fn(),
  translationUnavailable: vi.fn(() => false),
}))

import prisma from "@/lib/prisma"
import { currentUser } from "@/lib/cms/authz"
import { translate, translationUnavailable } from "@/lib/cms/translate"
import { getSystemNotice } from "@/lib/cms/system-notice"
import { setSystemNotice, translateNoticeAction } from "@/actions/admin/system-notice"

const editor = { id: "u1", privileges: ["system.view", "system.edit"] }
const viewer = { id: "u2", privileges: ["system.view"] }

beforeEach(() => vi.clearAllMocks())

describe("getSystemNotice", () => {
  it("returns the off-default when no row exists", async () => {
    vi.mocked(prisma.systemNotice.findUnique).mockResolvedValue(null as never)
    const dto = await getSystemNotice()
    expect(dto).toMatchObject({ enabled: false, showBanner: true, showModal: true, titleEn: "", titleZh: "" })
  })
})

describe("setSystemNotice", () => {
  const input = { enabled: true, showBanner: true, showModal: false, titleEn: "T", messageEn: "M", titleZh: "", messageZh: "" }

  it("requires system.edit", async () => {
    vi.mocked(currentUser).mockResolvedValue(viewer as never)
    const res = await setSystemNotice(input)
    expect(res.ok).toBe(false)
    expect(prisma.systemNotice.upsert).not.toHaveBeenCalled()
  })

  it("upserts the singleton row and stamps updatedBy", async () => {
    vi.mocked(currentUser).mockResolvedValue(editor as never)
    vi.mocked(prisma.systemNotice.upsert).mockResolvedValue({} as never)
    const res = await setSystemNotice(input)
    expect(res.ok).toBe(true)
    const arg = vi.mocked(prisma.systemNotice.upsert).mock.calls[0][0]
    expect(arg.where).toEqual({ id: 1 })
    expect(arg.update).toMatchObject({ enabled: true, showModal: false, titleEn: "T", titleZh: null, updatedBy: "u1" })
  })
})

describe("translateNoticeAction", () => {
  it("blocks non-editors", async () => {
    vi.mocked(currentUser).mockResolvedValue(viewer as never)
    expect((await translateNoticeAction({ titleEn: "Hi", messageEn: "There" })).ok).toBe(false)
  })

  it("maps title->title and message->body", async () => {
    vi.mocked(currentUser).mockResolvedValue(editor as never)
    vi.mocked(translationUnavailable).mockReturnValue(false)
    vi.mocked(translate).mockResolvedValue({ title: "标题", excerpt: "", body: "正文", sources: "" } as never)
    const res = await translateNoticeAction({ titleEn: "Title", messageEn: "Body" })
    expect(res).toEqual({ ok: true, titleZh: "标题", messageZh: "正文" })
    expect(translate).toHaveBeenCalledWith({ title: "Title", excerpt: "", body: "Body", sources: "" }, "en", "zh")
  })

  it("reports when the translator is unavailable", async () => {
    vi.mocked(currentUser).mockResolvedValue(editor as never)
    vi.mocked(translationUnavailable).mockReturnValue(true)
    const res = await translateNoticeAction({ titleEn: "Title", messageEn: "" })
    expect(res).toEqual({ ok: false, error: expect.any(String), unavailable: true })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/admin/system-notice.test.ts`
Expected: FAIL — cannot resolve `@/lib/cms/system-notice` / `@/actions/admin/system-notice`.

- [ ] **Step 3: Write the read lib**

```ts
// lib/cms/system-notice.ts
// The one global site notice — read side (no auth; used by the public API route
// and the admin page loader). Mutations live in actions/admin/system-notice.ts.
import prisma from "@/lib/prisma"

export interface SystemNoticeDTO {
  enabled: boolean
  showBanner: boolean
  showModal: boolean
  titleEn: string
  messageEn: string
  titleZh: string
  messageZh: string
  updatedAt: string | null
  updatedBy: string | null
}

export async function getSystemNotice(): Promise<SystemNoticeDTO> {
  const row = await prisma.systemNotice.findUnique({ where: { id: 1 } })
  return {
    enabled: row?.enabled ?? false,
    showBanner: row?.showBanner ?? true,
    showModal: row?.showModal ?? true,
    titleEn: row?.titleEn ?? "",
    messageEn: row?.messageEn ?? "",
    titleZh: row?.titleZh ?? "",
    messageZh: row?.messageZh ?? "",
    updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
    updatedBy: row?.updatedBy ?? null,
  }
}

/** Public wire shape consumed by the app (locale-nested, no audit fields). */
export function toNoticePayload(dto: SystemNoticeDTO) {
  return {
    enabled: dto.enabled,
    showBanner: dto.showBanner,
    showModal: dto.showModal,
    en: { title: dto.titleEn, message: dto.messageEn },
    zh: { title: dto.titleZh, message: dto.messageZh },
  }
}
```

- [ ] **Step 4: Write the actions**

```ts
// actions/admin/system-notice.ts
"use server"

import { revalidatePath } from "next/cache"
import prisma from "@/lib/prisma"
import { currentUser } from "@/lib/cms/authz"
import { translate, translationUnavailable } from "@/lib/cms/translate"

export interface SetNoticeInput {
  enabled: boolean
  showBanner: boolean
  showModal: boolean
  titleEn: string
  messageEn: string
  titleZh: string
  messageZh: string
}

export async function setSystemNotice(input: SetNoticeInput): Promise<{ ok: boolean; error?: string }> {
  const user = await currentUser()
  if (!user) return { ok: false, error: "Not authenticated" }
  if (!user.privileges.includes("system.edit")) return { ok: false, error: "Not allowed" }

  const data = {
    enabled: input.enabled,
    showBanner: input.showBanner,
    showModal: input.showModal,
    titleEn: input.titleEn.trim() || null,
    messageEn: input.messageEn.trim() || null,
    titleZh: input.titleZh.trim() || null,
    messageZh: input.messageZh.trim() || null,
    updatedBy: user.id,
  }
  await prisma.systemNotice.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } })
  revalidatePath("/admin/notice")
  return { ok: true }
}

export async function translateNoticeAction(
  input: { titleEn: string; messageEn: string },
): Promise<{ ok: true; titleZh: string; messageZh: string } | { ok: false; error: string; unavailable?: boolean }> {
  const user = await currentUser()
  if (!user) return { ok: false, error: "Not authenticated" }
  if (!user.privileges.includes("system.edit")) return { ok: false, error: "Not allowed" }
  if (translationUnavailable()) return { ok: false, error: "Translation service not configured", unavailable: true }
  if (!input.titleEn.trim() && !input.messageEn.trim()) return { ok: false, error: "Nothing to translate" }
  try {
    const out = await translate({ title: input.titleEn, excerpt: "", body: input.messageEn, sources: "" }, "en", "zh")
    return { ok: true, titleZh: out.title.trim(), messageZh: out.body.trim() }
  } catch {
    return { ok: false, error: "Translation failed" }
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run tests/admin/system-notice.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add lib/cms/system-notice.ts actions/admin/system-notice.ts tests/admin/system-notice.test.ts
git commit -m "feat(admin): SystemNotice read lib + set/translate actions"
```

---

### Task A3: Public read API route

**Files:**
- Create: `app/api/system-notice/route.ts`
- Test: `tests/admin/system-notice-route.test.ts`

**Interfaces:**
- Consumes: `getSystemNotice`, `toNoticePayload` (`@/lib/cms/system-notice`).
- Produces: `GET /api/system-notice` → `{ enabled, showBanner, showModal, en:{title,message}, zh:{title,message} }` with a short `Cache-Control`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/admin/system-notice-route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/cms/system-notice", () => ({
  getSystemNotice: vi.fn(),
  // use the real toNoticePayload
  toNoticePayload: (dto: Record<string, unknown>) => ({
    enabled: dto.enabled, showBanner: dto.showBanner, showModal: dto.showModal,
    en: { title: dto.titleEn, message: dto.messageEn },
    zh: { title: dto.titleZh, message: dto.messageZh },
  }),
}))

import { getSystemNotice } from "@/lib/cms/system-notice"
import { GET } from "@/app/api/system-notice/route"

beforeEach(() => vi.clearAllMocks())

it("returns the locale-nested payload with a short cache header", async () => {
  vi.mocked(getSystemNotice).mockResolvedValue({
    enabled: true, showBanner: true, showModal: false,
    titleEn: "T", messageEn: "M", titleZh: "标题", messageZh: "正文",
    updatedAt: null, updatedBy: null,
  })
  const res = await GET()
  expect(res.headers.get("Cache-Control")).toMatch(/max-age=30/)
  const body = await res.json()
  expect(body).toEqual({
    enabled: true, showBanner: true, showModal: false,
    en: { title: "T", message: "M" }, zh: { title: "标题", message: "正文" },
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/admin/system-notice-route.test.ts`
Expected: FAIL — cannot resolve `@/app/api/system-notice/route`.

- [ ] **Step 3: Write the route**

```ts
// app/api/system-notice/route.ts
import { NextResponse } from "next/server"
import { getSystemNotice, toNoticePayload } from "@/lib/cms/system-notice"

export const dynamic = "force-dynamic"

export async function GET() {
  const payload = toNoticePayload(await getSystemNotice())
  return NextResponse.json(payload, {
    headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=30" },
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/admin/system-notice-route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/system-notice/route.ts tests/admin/system-notice-route.test.ts
git commit -m "feat(admin): public GET /api/system-notice"
```

---

### Task A4: Admin page + card

**Files:**
- Create: `app/admin/notice/page.tsx`
- Create: `components/cms/notice/SystemNoticeCard.tsx`

**Interfaces:**
- Consumes: `currentUser` (`@/lib/cms/authz`), `getSystemNotice` (`@/lib/cms/system-notice`), `setSystemNotice`/`translateNoticeAction` (`@/actions/admin/system-notice`).
- Produces: the `/admin/notice` route.

- [ ] **Step 1: Write the server page**

```tsx
// app/admin/notice/page.tsx
import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { getSystemNotice } from "@/lib/cms/system-notice"
import { SystemNoticeCard } from "@/components/cms/notice/SystemNoticeCard"

export const dynamic = "force-dynamic"

export default async function SystemNoticePage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("system.view")) redirect("/admin")
  const notice = await getSystemNotice()
  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-1 text-lg font-semibold text-zinc-100">Site notice</h1>
      <p className="mb-6 text-sm text-zinc-500">
        A single banner/modal shown across app.subfrost.io. Turn it on for an outage or an
        announcement; turn it off to hide it. Changes reach the app within ~60s.
      </p>
      <SystemNoticeCard initial={notice} canEdit={me.privileges.includes("system.edit")} />
    </div>
  )
}
```

- [ ] **Step 2: Write the card (client form)**

```tsx
// components/cms/notice/SystemNoticeCard.tsx
"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { SystemNoticeDTO } from "@/lib/cms/system-notice"
import { setSystemNotice, translateNoticeAction } from "@/actions/admin/system-notice"

export function SystemNoticeCard({ initial, canEdit }: { initial: SystemNoticeDTO; canEdit: boolean }) {
  const router = useRouter()
  const [enabled, setEnabled] = useState(initial.enabled)
  const [showBanner, setShowBanner] = useState(initial.showBanner)
  const [showModal, setShowModal] = useState(initial.showModal)
  const [titleEn, setTitleEn] = useState(initial.titleEn)
  const [messageEn, setMessageEn] = useState(initial.messageEn)
  const [titleZh, setTitleZh] = useState(initial.titleZh)
  const [messageZh, setMessageZh] = useState(initial.messageZh)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [saving, startSave] = useTransition()
  const [translating, startTranslate] = useTransition()

  function save() {
    setError(null); setNote(null)
    startSave(async () => {
      const res = await setSystemNotice({ enabled, showBanner, showModal, titleEn, messageEn, titleZh, messageZh })
      if (res.ok) { setNote("Saved"); router.refresh() }
      else setError(res.error ?? "Failed to save")
    })
  }

  function translateZh() {
    setError(null); setNote(null)
    startTranslate(async () => {
      const res = await translateNoticeAction({ titleEn, messageEn })
      if (res.ok) { setTitleZh(res.titleZh); setMessageZh(res.messageZh); setNote("Translated (edit if needed)") }
      else setError(res.error)
    })
  }

  const busy = saving || translating
  const input = "w-full rounded border border-zinc-700 bg-zinc-900 p-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"

  return (
    <div className="space-y-5 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      <label className="flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-200">Active</span>
        <input type="checkbox" checked={enabled} disabled={!canEdit} onChange={(e) => setEnabled(e.target.checked)} />
      </label>

      <div className="flex gap-4 text-sm text-zinc-300">
        <label className="flex items-center gap-2"><input type="checkbox" checked={showBanner} disabled={!canEdit} onChange={(e) => setShowBanner(e.target.checked)} /> Show as banner</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={showModal} disabled={!canEdit} onChange={(e) => setShowModal(e.target.checked)} /> Show as modal</label>
      </div>

      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-zinc-500">English</p>
        <input className={input} placeholder="Title (shown uppercase in the modal)" value={titleEn} disabled={!canEdit} onChange={(e) => setTitleEn(e.target.value)} />
        <textarea className={input} rows={2} placeholder="Message" value={messageEn} disabled={!canEdit} onChange={(e) => setMessageEn(e.target.value)} />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-zinc-500">中文</p>
          <button type="button" className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-500 disabled:opacity-50" disabled={!canEdit || busy} onClick={translateZh}>
            {translating ? "Translating…" : "Translate to 中文"}
          </button>
        </div>
        <input className={input} placeholder="Title (中文) — empty falls back to English" value={titleZh} disabled={!canEdit} onChange={(e) => setTitleZh(e.target.value)} />
        <textarea className={input} rows={2} placeholder="Message (中文)" value={messageZh} disabled={!canEdit} onChange={(e) => setMessageZh(e.target.value)} />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-500">
          {initial.updatedAt ? `Last updated ${new Date(initial.updatedAt).toLocaleString()}${initial.updatedBy ? ` · ${initial.updatedBy}` : ""}` : "Never saved"}
        </span>
        <button type="button" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50" disabled={!canEdit || busy} onClick={save}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {note ? <p className="text-sm text-emerald-400">{note}</p> : null}
    </div>
  )
}
```

- [ ] **Step 3: Typecheck + build**

Run: `pnpm tsc --noEmit`
Expected: no errors.
Run: `pnpm build`
Expected: successful build (the new route + admin page compile).

- [ ] **Step 4: Manual verification (local)**

Run the site locally (`pnpm dev`), log in to `/admin` as a user with `system.edit`, open `/admin/notice`: toggle Active, check banner/modal, type EN, click **Translate to 中文** (fills ZH), Save. Then `curl http://localhost:3000/api/system-notice` → the JSON reflects what you saved with the short `Cache-Control`. (Auth for local admin per the repo's dev login.)

- [ ] **Step 5: Commit**

```bash
git add app/admin/notice/page.tsx components/cms/notice/SystemNoticeCard.tsx
git commit -m "feat(admin): Site notice admin card (toggle + EN/ZH + translate)"
```

---

### Task A5: Ship PR A + author the espo notice

- [ ] **Step 1: Full site gate**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm vitest run`
Expected: tsc clean; lint 0 errors; vitest green except the 3 allow-listed pre-existing failures (admin-nav / admin-landing / frbtc-indexer). New tests pass.

- [ ] **Step 2: Build**

Run: `pnpm build`
Expected: success.

- [ ] **Step 3: Stage the spec + plan, open the PR**

```bash
git add docs/superpowers/specs/2026-07-10-espo-outage-notice-admin-toggle-design.md \
        docs/superpowers/plans/2026-07-10-system-notice-admin-toggle.md
git commit -m "docs(admin): system-notice spec + plan"
git push -u origin <branch>
gh pr create --title "Admin-controlled site notice (banner + modal, EN+ZH)" --body "<summary + screenshot of /admin/notice>"
```

- [ ] **Step 4: Merge + deploy** — after "Deploy to GCP" passes, bump `newTag` (SHA in quotes) in `k8s/kustomization.yaml`, push `deploy(io):` to main, poll `kubectl rollout status`. The `prisma db push` init container creates the `SystemNotice` table.

- [ ] **Step 5: Author + enable the espo notice** — at `/admin/notice`: Active on, banner + modal both checked, Title "Espo.sh Data Services Are Down", Message "Data services provided by espo.sh are temporarily down. Wallet balances and transactions are unaffected.", click **Translate to 中文**, Save. Verify `https://subfrost.io/api/system-notice` returns it. **This must be done before PR B ships.**

---

# PHASE B — subfrost-app (PR B)

Branch off fresh `origin/main` in `C:\subfrost-app-pr`.

### Task B1: Fail-safe proxy route

**Files:**
- Create: `app/api/system-notice/route.ts`
- Test: `tests/system-notice-route.test.ts`

**Interfaces:**
- Produces: `GET /api/system-notice` → the site payload, or `{ enabled: false }` on any failure (HTTP 200). Env `SYSTEM_NOTICE_URL` default `https://subfrost.io/api/system-notice`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/system-notice-route.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { GET } from "@/app/api/system-notice/route"

const OK = { enabled: true, showBanner: true, showModal: true, en: { title: "T", message: "M" }, zh: { title: "", message: "" } }

beforeEach(() => vi.restoreAllMocks())
afterEach(() => vi.restoreAllMocks())

it("passes the upstream payload through on success", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(OK), { status: 200 })))
  const res = await GET()
  expect(await res.json()).toEqual(OK)
})

it("fails safe to disabled on upstream error", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 500 })))
  const res = await GET()
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ enabled: false })
})

it("fails safe to disabled when fetch throws", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")))
  const res = await GET()
  expect(await res.json()).toEqual({ enabled: false })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/system-notice-route.test.ts`
Expected: FAIL — cannot resolve `@/app/api/system-notice/route`.

- [ ] **Step 3: Write the route**

```ts
// app/api/system-notice/route.ts
// Fail-safe proxy for the site's system-notice API. Any upstream failure returns
// { enabled: false } (HTTP 200) so the banner/modal simply stay hidden — never a
// render error, never a false outage notice. Short cache to bound propagation.
import { NextResponse } from "next/server"

const SYSTEM_NOTICE_URL = process.env.SYSTEM_NOTICE_URL || "https://subfrost.io/api/system-notice"
const TIMEOUT_MS = 3_000
const CACHE_HEADER = "public, max-age=30, stale-while-revalidate=30"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const upstream = await fetch(SYSTEM_NOTICE_URL, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    })
    if (!upstream.ok) throw new Error(`upstream HTTP ${upstream.status}`)
    const data = await upstream.json()
    return NextResponse.json(data, { headers: { "Cache-Control": CACHE_HEADER } })
  } catch (err) {
    console.warn("[/api/system-notice] fail-safe (off):", err instanceof Error ? err.message : err)
    return NextResponse.json({ enabled: false }, { headers: { "Cache-Control": CACHE_HEADER } })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/system-notice-route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/system-notice/route.ts tests/system-notice-route.test.ts
git commit -m "feat(notice): fail-safe /api/system-notice proxy"
```

---

### Task B2: Pure `resolveNotice` + `useSystemNotice` hook

**Files:**
- Create: `lib/systemNotice.ts`
- Create: `hooks/useSystemNotice.ts`
- Test: `tests/systemNotice.test.ts`

**Interfaces:**
- Produces:
  - `interface NoticePayload { enabled: boolean; showBanner?: boolean; showModal?: boolean; en?: { title: string; message: string }; zh?: { title: string; message: string } }`
  - `interface ResolvedNotice { enabled: boolean; showBanner: boolean; showModal: boolean; title: string; message: string }`
  - `resolveNotice(payload: NoticePayload | undefined, locale: "en" | "zh"): ResolvedNotice` (pure) in `lib/systemNotice.ts`.
  - `useSystemNotice(): ResolvedNotice` in `hooks/useSystemNotice.ts` (react-query + `useTranslation` locale).

- [ ] **Step 1: Write the failing test**

```ts
// tests/systemNotice.test.ts
import { describe, it, expect } from "vitest"
import { resolveNotice } from "@/lib/systemNotice"

const OFF = { enabled: false, showBanner: false, showModal: false, title: "", message: "" }

describe("resolveNotice", () => {
  it("returns all-off for undefined or disabled payloads", () => {
    expect(resolveNotice(undefined, "en")).toEqual(OFF)
    expect(resolveNotice({ enabled: false }, "en")).toEqual(OFF)
  })

  it("resolves the English content when enabled", () => {
    const r = resolveNotice({ enabled: true, showBanner: true, showModal: false, en: { title: "T", message: "M" }, zh: { title: "标题", message: "正文" } }, "en")
    expect(r).toEqual({ enabled: true, showBanner: true, showModal: false, title: "T", message: "M" })
  })

  it("resolves ZH when locale is zh", () => {
    const r = resolveNotice({ enabled: true, showBanner: true, showModal: true, en: { title: "T", message: "M" }, zh: { title: "标题", message: "正文" } }, "zh")
    expect(r.title).toBe("标题")
    expect(r.message).toBe("正文")
  })

  it("falls back to EN when a ZH field is empty", () => {
    const r = resolveNotice({ enabled: true, showBanner: true, showModal: true, en: { title: "T", message: "M" }, zh: { title: "", message: "" } }, "zh")
    expect(r.title).toBe("T")
    expect(r.message).toBe("M")
  })

  it("defaults surface flags to true when omitted", () => {
    const r = resolveNotice({ enabled: true, en: { title: "T", message: "" } }, "en")
    expect(r.showBanner).toBe(true)
    expect(r.showModal).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/systemNotice.test.ts`
Expected: FAIL — cannot resolve `@/lib/systemNotice`.

- [ ] **Step 3: Write the pure module**

```ts
// lib/systemNotice.ts
// Pure resolution of the system-notice payload into the fields a surface renders,
// for the viewer's locale (ZH falls back to EN when empty). No React, no network.
export interface NoticePayload {
  enabled: boolean
  showBanner?: boolean
  showModal?: boolean
  en?: { title: string; message: string }
  zh?: { title: string; message: string }
}

export interface ResolvedNotice {
  enabled: boolean
  showBanner: boolean
  showModal: boolean
  title: string
  message: string
}

const OFF: ResolvedNotice = { enabled: false, showBanner: false, showModal: false, title: "", message: "" }

export function resolveNotice(payload: NoticePayload | undefined, locale: "en" | "zh"): ResolvedNotice {
  if (!payload?.enabled) return OFF
  const en = payload.en ?? { title: "", message: "" }
  const zh = payload.zh ?? { title: "", message: "" }
  const pick = (a: string, b: string) => (locale === "zh" ? (a.trim() || b) : b)
  return {
    enabled: true,
    showBanner: payload.showBanner ?? true,
    showModal: payload.showModal ?? true,
    title: pick(zh.title, en.title),
    message: pick(zh.message, en.message),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/systemNotice.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the hook** (thin react-query wrapper; both surfaces call it and react-query dedupes to one poll)

```ts
// hooks/useSystemNotice.ts
"use client"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "@/hooks/useTranslation"
import { resolveNotice, type NoticePayload, type ResolvedNotice } from "@/lib/systemNotice"

export function useSystemNotice(): ResolvedNotice {
  const { locale } = useTranslation()
  const { data } = useQuery({
    queryKey: ["systemNotice"],
    queryFn: async (): Promise<NoticePayload> => {
      const res = await fetch("/api/system-notice")
      return res.json()
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: false,
  })
  return resolveNotice(data, locale)
}
```

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm tsc --noEmit`
Expected: no errors.

```bash
git add lib/systemNotice.ts hooks/useSystemNotice.ts tests/systemNotice.test.ts
git commit -m "feat(notice): resolveNotice + useSystemNotice hook"
```

---

### Task B3: Rename + gate the two surfaces, wire AppShell, clean i18n

**Files:**
- Rename: `app/components/EspoDownBanner.tsx` → `app/components/SystemNoticeBanner.tsx`
- Rename: `app/components/DemoBanner.tsx` → `app/components/SystemNoticeModal.tsx`
- Modify: `app/components/AppShell.tsx`
- Modify: `i18n/en.ts`, `i18n/zh.ts`

**Interfaces:**
- Consumes: `useSystemNotice` (Task B2).
- Produces: `SystemNoticeBanner`, `SystemNoticeModal` (default exports), driven by the notice; `notice.understand` i18n key.

- [ ] **Step 1: Create `SystemNoticeBanner.tsx`** (rename target; keep the dismiss key)

```tsx
// app/components/SystemNoticeBanner.tsx
"use client"

// Thin top-of-page banner for the admin-controlled site notice. Visibility is
// driven by useSystemNotice() (enabled + showBanner); copy comes from the notice.
// Per-session dismiss via sessionStorage (key unchanged — e2e/puppeteer helpers
// pre-set it).
import { useEffect, useState } from "react"
import { useTranslation } from "@/hooks/useTranslation"
import { useSystemNotice } from "@/hooks/useSystemNotice"

const DISMISS_KEY = "sf-espo-down-dismissed"

export default function SystemNoticeBanner() {
  const { t } = useTranslation()
  const notice = useSystemNotice()
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1")
  }, [])

  if (dismissed || !notice.enabled || !notice.showBanner) return null

  const line = notice.message || notice.title
  if (!line) return null

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1")
    setDismissed(true)
  }

  return (
    <div role="status" aria-live="polite" className="border-b border-[color:var(--sf-row-border)] bg-[color:var(--sf-surface)]/70 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1400px] items-start gap-3 px-4 py-2 sm:px-6">
        <div className="mt-0.5 hidden h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[color:var(--sf-primary)]/40 text-[10px] font-bold text-[color:var(--sf-primary)] sm:flex">i</div>
        <p className="flex-1 text-xs leading-snug text-[color:var(--sf-text)]/80 sm:text-sm">{line}</p>
        <button type="button" onClick={handleDismiss} aria-label={t("banner.dismiss")} className="-mr-1 rounded p-1 text-[color:var(--sf-text)]/60 transition-colors hover:bg-[color:var(--sf-row-border)]/40 hover:text-[color:var(--sf-text)]">
          <span aria-hidden="true" className="block h-4 w-4 leading-none text-center">×</span>
        </button>
      </div>
    </div>
  )
}
```
Then `git rm app/components/EspoDownBanner.tsx` (or delete the old file).

- [ ] **Step 2: Create `SystemNoticeModal.tsx`** (rename target; keep the dismiss key)

```tsx
// app/components/SystemNoticeModal.tsx
"use client"

// Full-screen modal for the admin-controlled site notice. Visibility driven by
// useSystemNotice() (enabled + showModal); title/body from the notice. Per-session
// dismiss via sessionStorage (key unchanged — e2e/puppeteer helpers pre-set it).
import { useState, useEffect } from "react"
import { useTranslation } from "@/hooks/useTranslation"
import { useSystemNotice } from "@/hooks/useSystemNotice"
import LanguageToggle from "./LanguageToggle"

const DISMISS_KEY = "sf-demo-banner-dismissed"

export default function SystemNoticeModal() {
  const { t } = useTranslation()
  const notice = useSystemNotice()
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1")
  }, [])

  if (dismissed || !notice.enabled || !notice.showModal) return null
  if (!notice.title && !notice.message) return null

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1")
    setDismissed(true)
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm px-4 animate-in fade-in duration-200" onClick={handleDismiss}>
      <div className="w-[480px] max-w-[92vw] overflow-hidden rounded-3xl bg-[color:var(--sf-glass-bg)] shadow-[0_24px_96px_rgba(0,0,0,0.4)] backdrop-blur-xl animate-in zoom-in-95 slide-in-from-bottom-4 duration-[400ms]" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Site notice">
        <div className="bg-[color:var(--sf-panel-bg)] px-6 py-5 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-extrabold tracking-wider uppercase text-[color:var(--sf-text)]">{notice.title}</h2>
            <LanguageToggle />
          </div>
        </div>
        <div className="px-6 py-4">
          <p className="text-sm leading-relaxed text-[color:var(--sf-text)]/60 whitespace-pre-line">{notice.message}</p>
          <div className="mt-4 flex justify-center">
            <button type="button" onClick={handleDismiss} className="w-full rounded-xl bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] py-3 text-sm font-bold uppercase tracking-wide text-white shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)]">
              {t("notice.understand")}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
```
Then delete `app/components/DemoBanner.tsx`.

- [ ] **Step 3: Update `AppShell.tsx` imports + mounts**

Change the imports (lines ~20-21):
```tsx
import SystemNoticeBanner from '@/app/components/SystemNoticeBanner';
import SystemNoticeModal from '@/app/components/SystemNoticeModal';
```
and the mounts (were `<EspoDownBanner />` / `<DemoBanner />`):
```tsx
      <SystemNoticeBanner />
      <SystemNoticeModal />
```

- [ ] **Step 4: Clean up i18n** — in `i18n/en.ts` and `i18n/zh.ts`: delete the `demo.warning`, `demo.description`, and `banner.espoDown` keys; rename `demo.understand` → `notice.understand` (keep the same values: EN `'I Understand'`, ZH `'我已了解'`). Keep `banner.dismiss` and `banner.indexResync`.

- [ ] **Step 5: Typecheck + lint + unit + build**

Run: `pnpm tsc --noEmit`
Expected: no errors (no dangling `EspoDownBanner`/`DemoBanner`/`demo.*` references — grep to confirm: `git grep -n "EspoDownBanner\|DemoBanner\|demo\.warning\|demo\.description\|banner\.espoDown\|demo\.understand"` returns nothing).
Run: `pnpm test:unit`
Expected: PASS (route + resolveNotice node tests; existing suite unaffected).
Run: `pnpm build`
Expected: success.

- [ ] **Step 6: Manual verification (local, or against prod once PR A is live)**

Point the app at the live site notice (default `SYSTEM_NOTICE_URL`). With the espo notice enabled in the site admin: run the app (`pnpm dev`), confirm the banner + modal appear; toggle each surface in the admin and confirm the app reflects it within ~60s; switch app language and confirm ZH; turn Active off and confirm both disappear.

- [ ] **Step 7: Commit**

```bash
git add app/components/SystemNoticeBanner.tsx app/components/SystemNoticeModal.tsx app/components/AppShell.tsx i18n/en.ts i18n/zh.ts
git rm app/components/EspoDownBanner.tsx app/components/DemoBanner.tsx
git commit -m "feat(notice): drive banner + modal from the admin notice; retire hardcoded espo/beta"
```

---

### Task B4: Ship PR B

- [ ] **Step 1: Confirm PR A is live and the espo notice is enabled** — `curl https://subfrost.io/api/system-notice` returns `enabled: true` with the espo copy. (If not, the app's banner/modal will be off after this deploy.)

- [ ] **Step 2: Full app gate**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm test:unit && pnpm build`
Expected: all green.

- [ ] **Step 3: Open the PR**

```bash
git push -u origin <branch>
gh pr create --title "Drive outage banner + modal from the admin site notice" --body "<summary; depends on subfrost.io system-notice API being live + espo notice enabled>"
```
Merged by Flex/Gabe → Cloud Run auto-deploy. Supersedes #356/#358/#359.

- [ ] **Step 4: Post-deploy drill** — in the site admin, flip Active off → both disappear in the app ≤60s; on → reappear; edit message → updates; toggle each surface. This drill is the definition of done.

---

## Self-Review

**1. Spec coverage**

| Spec item | Task |
|---|---|
| Admin card in subfrost.io/admin, `system.edit` gated | A1 (privilege/nav) + A4 (card) |
| `SystemNotice` row (enabled, showBanner, showModal, EN+ZH) | A1 (model) |
| Server actions get/set + translate | A2 |
| ZH via existing Claude `translate()` | A2 (`translateNoticeAction`) |
| Public `GET /api/system-notice`, short cache | A3 |
| App fail-safe proxy, cache ≤60s | B1 |
| Locale resolution + EN fallback | B2 (`resolveNotice`) |
| Poll ~60s, shared fetch | B2 (react-query dedupe) |
| Banner + modal gated by enabled + surface flag | B3 |
| Rename components, keep sessionStorage keys | B3 |
| Remove hardcoded espo/beta copy + i18n keys | B3 |
| Site-first rollout + enable espo notice before PR B | A5 + B4 |
| Fail-safe / cache / single-source de-risk | B1 + A3 + drill (B4) |

No gaps. (Spec's optional `translateNotice` helper is intentionally simplified to reuse the existing `translate()` — title↔title, message↔body — noted in A2.)

**2. Placeholder scan:** No TBD/TODO; every code step is complete. `<branch>` / `<summary>` in A5/B4 are genuine human fill-ins at ship time.

**3. Type consistency:** `SystemNoticeDTO` (site) defined in `lib/cms/system-notice.ts`, consumed by A3/A4. `SetNoticeInput` fields match the card's `setSystemNotice(...)` call and the test. App `NoticePayload`/`ResolvedNotice` defined in `lib/systemNotice.ts`, consumed by `useSystemNotice` + both surfaces. `resolveNotice(payload, locale)` signature matches the hook call. The public payload shape (`{enabled, showBanner, showModal, en:{title,message}, zh:{title,message}}`) is identical in `toNoticePayload` (A2), the route test (A3), and `NoticePayload` (B2).
