# Review comments: Google-Docs-style anchored margin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-lay-out the article-review comment UI (`/admin/articles/[id]/preview`) so each comment card sits in the right margin at the same vertical Y as its highlighted text (Google-Docs style), in document order, with bidirectional focus — replacing today's DB-ordered fixed sidebar list.

**Architecture:** Kill `CommentPanel` as a desktop list. Comment cards become absolutely-positioned children of a right-side **gutter** that lives in the **same scroll container** as the article (a shared `relative` wrapper), so Y-alignment is possible by construction and there is never a second scroll container. A pure, DOM-free layout function resolves card tops (top-down / two-pass-on-focus collision). Mobile keeps the bottom-sheet.

**Tech Stack:** Next 16 (App Router, client components), React 19, TypeScript, Tailwind, Vitest + happy-dom + `@testing-library/react`. Backend (`ArticleComment`, `actions/cms/articles-review.ts`, anchoring in `lib/cms/annotation-anchor.ts`) is **unchanged**.

## Global Constraints

- **Backend unchanged.** No edits to `actions/cms/articles-review.ts`, `lib/cms/annotation-anchor.ts`, Prisma schema, or any server action. This is a frontend/layout change only.
- **One scroll container only.** The old `aside` with its own `overflow-y-auto` is gone on desktop. The gutter scrolls with the page.
- **Dismiss/defocus uses `pointerdown` + containment, never `click`/`mouseup`.** The "element eats the click" bug (#202 / the WS5 popover) bit this exact component before. See `lib/cms/comment-layout.ts::isInsideAny`.
- **Measurement:** mark Y from `mark.getClientRects()[0].top` (start of a multi-line quote), minus the gutter's `getBoundingClientRect().top`. Never `getBoundingClientRect()` on the mark.
- **Document order:** cards sort by `anchor.start` (global char offset already stored on every comment), not `createdAt`.
- **Resolved hidden by default** (header toggle "Show resolved (n)"). **ORPHANED / unlocatable** comments go in a fixed top section, outside the collision algorithm — never invent a Y.
- **Respect `prefers-reduced-motion`** on all transitions (`motion-reduce:transition-none`).
- **Desktop/mobile split at `lg` (1024px)** — closest Tailwind breakpoint to the spec's ~1050px. `≥ lg`: gutter. `< lg`: bottom-sheet + FAB.
- **Copy:** UI is English (admin-only). No em-dashes in any user-facing string (SUBFROST house rule).
- **Rollout:** branch off fresh `origin/main` → PR → merge → Flux `newTag` bump (SHA in quotes). Gate: `pnpm tsc --noEmit` + `pnpm lint` + `pnpm vitest run` + build. Pre-existing allow-listed test failures: admin-nav / admin-landing / frbtc-indexer — filter those when reading the gate. Include this plan + the spec (`docs/superpowers/specs/2026-07-10-review-comments-gdocs-margin-design.md`, currently untracked) in the PR.

## File Structure

- **Create** `lib/cms/comment-layout.ts` — pure geometry + ordering/partition + dismiss-containment helpers. No DOM, no React. The `Thread` type moves here (single source).
- **Create** `tests/articles/comment-layout.test.ts` — unit tests for the pure module.
- **Create** `components/cms/articles/CommentCard.tsx` — one thread card (quote, author, body, replies, reply/resolve composer, focus visuals). Exports `CommentCard` + `CommentRow` (moved out of `CommentPanel`).
- **Create** `tests/articles/CommentCard.test.tsx` — RTL structural test.
- **Create** `components/cms/articles/CommentGutter.tsx` — the absolutely-positioned desktop rail: partitions threads, runs `layoutCards`, renders positioned cards + orphan top-section + resolved toggle.
- **Create** `tests/articles/CommentGutter.test.tsx` — RTL structural test (document order, resolved hidden/shown, orphan section).
- **Modify** `components/cms/articles/comment-color.ts` — add `highlightColorStrong` (saturated fill for focused marks).
- **Modify** `components/cms/articles/AnnotatedArticle.tsx` — replace `flex-row` + desktop `CommentPanel` with the `relative` wrapper + `<CommentGutter>` (desktop) and mobile sheet; owns `focusedId`, `measureTop`, reflow, mark saturation, `pointerdown` dismiss.
- **Modify** `components/cms/articles/CommentPanel.tsx` — retire the list variant; becomes a mobile-only bottom-sheet that reuses `CommentCard`, ordered by document position, opening scrolled to the tapped thread.

---

### Task 1: Pure layout, ordering, and dismiss helpers

**Files:**
- Create: `lib/cms/comment-layout.ts`
- Test: `tests/articles/comment-layout.test.ts`

**Interfaces:**
- Consumes: `CommentDTO` (type only) from `@/actions/cms/articles-review`.
- Produces:
  - `interface Thread { root: CommentDTO; replies: CommentDTO[] }`
  - `interface DesiredCard { id: string; top: number; height: number }`
  - `layoutCards(desired: DesiredCard[], focusedId: string | null, gap: number): Map<string, number>` — `desired` MUST be pre-sorted in document order; returns id → final top.
  - `orderThreadsByAnchor(threads: Thread[]): Thread[]`
  - `partitionThreads(threads: Thread[]): { open: Thread[]; resolved: Thread[]; orphaned: Thread[] }`
  - `isInsideAny(target: Node | null, els: (Node | null | undefined)[]): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// tests/articles/comment-layout.test.ts
import { describe, it, expect } from "vitest"
import {
  layoutCards,
  orderThreadsByAnchor,
  partitionThreads,
  isInsideAny,
  type Thread,
} from "@/lib/cms/comment-layout"

function thread(
  id: string,
  start: number | null,
  status: Thread["root"]["status"] = "OPEN",
  createdAt = "2026-01-01T00:00:00.000Z",
): Thread {
  return {
    root: {
      id, articleId: "a", versionId: null, locale: "en",
      author: { id: "u", name: "U", avatarUrl: null },
      anchor: (start == null
        ? undefined
        : { quote: "q", prefix: "", suffix: "", blockIndex: 0, start, end: start + 1 }) as Thread["root"]["anchor"],
      body: "b", status, parentId: null, createdAt, updatedAt: createdAt,
    },
    replies: [],
  }
}

describe("layoutCards", () => {
  it("returns an empty map for no cards", () => {
    expect(layoutCards([], null, 10).size).toBe(0)
  })

  it("places a single card at its desired top", () => {
    const out = layoutCards([{ id: "a", top: 42, height: 30 }], null, 10)
    expect(out.get("a")).toBe(42)
  })

  it("leaves non-overlapping cards at their desired tops (no focus)", () => {
    const out = layoutCards(
      [{ id: "a", top: 0, height: 50 }, { id: "b", top: 100, height: 50 }],
      null, 10,
    )
    expect(out.get("a")).toBe(0)
    expect(out.get("b")).toBe(100)
  })

  it("pushes an overlapping lower card down by the gap (no focus)", () => {
    const out = layoutCards(
      [{ id: "a", top: 0, height: 50 }, { id: "b", top: 30, height: 40 }],
      null, 10,
    )
    expect(out.get("a")).toBe(0)
    expect(out.get("b")).toBe(60) // 0 + 50 + 10
  })

  it("pins the focused card and makes neighbours cede space", () => {
    const out = layoutCards(
      [
        { id: "a", top: 0, height: 100 },
        { id: "b", top: 50, height: 40 },
        { id: "c", top: 60, height: 100 },
      ],
      "b", 10,
    )
    expect(out.get("b")).toBe(50)          // pinned at desired
    expect(out.get("c")).toBe(100)         // below: max(60, 50+40+10)
    expect(out.get("a")).toBe(-60)         // above: min(0, 50-10-100)
  })
})

describe("orderThreadsByAnchor", () => {
  it("sorts by anchor.start, null anchors last", () => {
    const ids = orderThreadsByAnchor([thread("c", 30), thread("a", 10), thread("z", null), thread("b", 20)])
      .map((t) => t.root.id)
    expect(ids).toEqual(["a", "b", "c", "z"])
  })
})

describe("partitionThreads", () => {
  it("buckets by status and orders open by anchor", () => {
    const p = partitionThreads([
      thread("r", 5, "RESOLVED"),
      thread("o2", 40, "OPEN"),
      thread("orph", 0, "ORPHANED"),
      thread("o1", 10, "OPEN"),
    ])
    expect(p.open.map((t) => t.root.id)).toEqual(["o1", "o2"])
    expect(p.resolved.map((t) => t.root.id)).toEqual(["r"])
    expect(p.orphaned.map((t) => t.root.id)).toEqual(["orph"])
  })
})

describe("isInsideAny", () => {
  it("is true only when target is contained by an element", () => {
    const outer = document.createElement("div")
    const inner = document.createElement("span")
    outer.appendChild(inner)
    const other = document.createElement("div")
    expect(isInsideAny(inner, [outer])).toBe(true)
    expect(isInsideAny(inner, [other, null, undefined])).toBe(false)
    expect(isInsideAny(null, [outer])).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/articles/comment-layout.test.ts`
Expected: FAIL — cannot resolve `@/lib/cms/comment-layout`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/cms/comment-layout.ts
// Pure geometry + ordering helpers for the Google-Docs-style review comment
// gutter. No DOM traversal, no React — unit-tested directly. The gutter feeds
// measured mark Ys + card heights in; these functions decide final card tops.

import type { CommentDTO } from "@/actions/cms/articles-review"

/** A root comment plus its replies. The single source for this shape. */
export interface Thread {
  root: CommentDTO
  replies: CommentDTO[]
}

/** A card's desired Y (mark top, relative to gutter top) and measured height. */
export interface DesiredCard {
  id: string
  top: number
  height: number
}

/**
 * Resolve final card tops so no two cards overlap (each separated by `gap`),
 * keeping every card as close to its desired Y as possible.
 *
 * - No focus: one top-down sweep — a card sits at its desired Y unless the card
 *   above forces it lower.
 * - With focus: the focused card is pinned at its exact desired Y; cards below
 *   sweep down from it, cards above sweep up (they cede space).
 *
 * O(n), two passes. `desired` MUST be pre-sorted in document order.
 */
export function layoutCards(
  desired: DesiredCard[],
  focusedId: string | null,
  gap: number,
): Map<string, number> {
  const out = new Map<string, number>()
  const n = desired.length
  if (n === 0) return out

  const f = focusedId ? desired.findIndex((d) => d.id === focusedId) : -1

  if (f === -1) {
    let minTop = -Infinity
    for (const d of desired) {
      const top = Math.max(d.top, minTop)
      out.set(d.id, top)
      minTop = top + d.height + gap
    }
    return out
  }

  // Pin the focused card, then sweep outward in both directions.
  out.set(desired[f].id, desired[f].top)

  let minTop = desired[f].top + desired[f].height + gap
  for (let i = f + 1; i < n; i++) {
    const top = Math.max(desired[i].top, minTop)
    out.set(desired[i].id, top)
    minTop = top + desired[i].height + gap
  }

  let ceiling = desired[f].top - gap
  for (let i = f - 1; i >= 0; i--) {
    const top = Math.min(desired[i].top, ceiling - desired[i].height)
    out.set(desired[i].id, top)
    ceiling = top - gap
  }

  return out
}

/** Sort root threads by anchor document position (createdAt tiebreak). Null or
 *  missing anchors sort last. */
export function orderThreadsByAnchor(threads: Thread[]): Thread[] {
  return [...threads].sort((a, b) => {
    const sa = a.root.anchor?.start ?? Number.MAX_SAFE_INTEGER
    const sb = b.root.anchor?.start ?? Number.MAX_SAFE_INTEGER
    if (sa !== sb) return sa - sb
    return a.root.createdAt.localeCompare(b.root.createdAt)
  })
}

/** Split threads by review status. open/resolved keep document order; orphaned
 *  keeps createdAt order (no reliable position). */
export function partitionThreads(threads: Thread[]): {
  open: Thread[]
  resolved: Thread[]
  orphaned: Thread[]
} {
  const open: Thread[] = []
  const resolved: Thread[] = []
  const orphaned: Thread[] = []
  for (const t of threads) {
    if (t.root.status === "RESOLVED") resolved.push(t)
    else if (t.root.status === "ORPHANED") orphaned.push(t)
    else open.push(t)
  }
  return {
    open: orderThreadsByAnchor(open),
    resolved: orderThreadsByAnchor(resolved),
    orphaned: [...orphaned].sort((a, b) => a.root.createdAt.localeCompare(b.root.createdAt)),
  }
}

/** True if `target` is contained by any of the given elements. Used by the
 *  pointerdown dismiss guard (the "element eats the click" fix, #202). */
export function isInsideAny(target: Node | null, els: (Node | null | undefined)[]): boolean {
  if (!target) return false
  return els.some((el) => el != null && el.contains(target))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/articles/comment-layout.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/cms/comment-layout.ts tests/articles/comment-layout.test.ts
git commit -m "feat(cms): pure layout/ordering helpers for anchored comment gutter"
```

---

### Task 2: `CommentCard` component

**Files:**
- Create: `components/cms/articles/CommentCard.tsx`
- Test: `tests/articles/CommentCard.test.tsx`

**Interfaces:**
- Consumes: `Thread` from `@/lib/cms/comment-layout`; `accentColor` from `./comment-color`; `CommentDTO` (type) from `@/actions/cms/articles-review`; `Button` from `@/components/ui/button`.
- Produces:
  - `CommentRow({ c: CommentDTO })` — avatar + name + time + body row (moved verbatim from `CommentPanel`).
  - `CommentCard(props)` where props are:
    ```ts
    {
      thread: Thread
      focused: boolean
      dimmed: boolean
      canComment: boolean
      busy: boolean
      onFocus: () => void
      onReply: (parentId: string, body: string) => void | Promise<void>
      onResolve: (id: string) => void
      onReopen: (id: string) => void
    }
    ```
    Root element carries `data-comment-card={thread.root.id}`; focused adds `-translate-x-2 border-zinc-500 shadow-lg`; dimmed adds `opacity-60`; the reply/resolve composer renders only when `focused`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/articles/CommentCard.test.tsx
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { CommentCard } from "@/components/cms/articles/CommentCard"
import type { Thread } from "@/lib/cms/comment-layout"

function thread(): Thread {
  return {
    root: {
      id: "c1", articleId: "a", versionId: null, locale: "en",
      author: { id: "u", name: "Ada Lovelace", avatarUrl: null },
      anchor: { quote: "the trecho", prefix: "", suffix: "", blockIndex: 0, start: 0, end: 10 },
      body: "needs a citation", status: "OPEN", parentId: null,
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    },
    replies: [],
  }
}

const noop = () => {}

describe("CommentCard", () => {
  it("shows quote + body and, when focused, the resolve composer", () => {
    render(
      <CommentCard thread={thread()} focused dimmed={false} canComment busy={false}
        onFocus={noop} onReply={vi.fn()} onResolve={vi.fn()} onReopen={noop} />,
    )
    expect(screen.getByText(/the trecho/)).toBeInTheDocument()
    expect(screen.getByText("needs a citation")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Resolve" })).toBeInTheDocument()
  })

  it("hides the composer when not focused and applies the focus slide when focused", () => {
    const { rerender, container } = render(
      <CommentCard thread={thread()} focused={false} dimmed canComment busy={false}
        onFocus={noop} onReply={vi.fn()} onResolve={vi.fn()} onReopen={noop} />,
    )
    expect(screen.queryByRole("button", { name: "Resolve" })).toBeNull()
    expect(container.querySelector("[data-comment-card]")?.className).toContain("opacity-60")

    rerender(
      <CommentCard thread={thread()} focused dimmed={false} canComment busy={false}
        onFocus={noop} onReply={vi.fn()} onResolve={vi.fn()} onReopen={noop} />,
    )
    expect(container.querySelector("[data-comment-card]")?.className).toContain("-translate-x-2")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/articles/CommentCard.test.tsx`
Expected: FAIL — cannot resolve `@/components/cms/articles/CommentCard`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// components/cms/articles/CommentCard.tsx
"use client"

// One review thread rendered as a card: quote, author row, body, replies, and
// (when focused) a reply/resolve composer. Presentational — all mutations are
// delegated to callbacks owned by AnnotatedArticle. Used by both the desktop
// CommentGutter and the mobile bottom-sheet.

import { useState } from "react"
import { Button } from "@/components/ui/button"
import type { CommentDTO } from "@/actions/cms/articles-review"
import type { Thread } from "@/lib/cms/comment-layout"
import { accentColor } from "./comment-color"

function initials(name: string) {
  return name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase()
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

export function CommentRow({ c }: { c: CommentDTO }) {
  return (
    <div className="flex gap-2">
      <span
        className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
        style={{ background: accentColor(c.author.id) }}
        title={c.author.name}
      >
        {initials(c.author.name)}
      </span>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-xs font-medium text-zinc-100">{c.author.name}</span>
          <span className="text-[10px] text-zinc-500">{timeLabel(c.createdAt)}</span>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm text-zinc-300">{c.body}</p>
      </div>
    </div>
  )
}

export function CommentCard({
  thread,
  focused,
  dimmed,
  canComment,
  busy,
  onFocus,
  onReply,
  onResolve,
  onReopen,
}: {
  thread: Thread
  focused: boolean
  dimmed: boolean
  canComment: boolean
  busy: boolean
  onFocus: () => void
  onReply: (parentId: string, body: string) => void | Promise<void>
  onResolve: (id: string) => void
  onReopen: (id: string) => void
}) {
  const { root, replies } = thread
  const [reply, setReply] = useState("")
  const resolved = root.status === "RESOLVED"
  const orphaned = root.status === "ORPHANED"

  return (
    <div
      data-comment-card={root.id}
      onClick={onFocus}
      className={`cursor-pointer rounded-lg border bg-zinc-900 p-2 shadow-sm transition-[transform,opacity,border-color,box-shadow] duration-200 ease-out motion-reduce:transition-none ${
        focused
          ? "-translate-x-2 border-zinc-500 shadow-lg"
          : dimmed
            ? "border-zinc-800 opacity-60"
            : "border-zinc-800"
      }`}
      style={{ borderLeft: `3px solid ${accentColor(root.author.id)}` }}
    >
      {root.anchor?.quote ? (
        <p className="mb-1 line-clamp-2 border-l border-zinc-700 pl-2 text-[11px] italic text-zinc-500">
          “{root.anchor.quote}”
        </p>
      ) : null}
      <CommentRow c={root} />
      <div className="mt-1 flex items-center gap-2 text-[10px]">
        {replies.length > 0 ? (
          <span className="text-zinc-500">{replies.length} repl{replies.length === 1 ? "y" : "ies"}</span>
        ) : null}
        {resolved ? <span className="rounded bg-emerald-900/50 px-1 text-emerald-300">Resolved</span> : null}
        {orphaned ? <span className="rounded bg-amber-900/50 px-1 text-amber-300">Orphaned</span> : null}
      </div>

      {focused ? (
        <div className="mt-2 space-y-2 border-t border-zinc-800 pt-2">
          {replies.map((r) => <CommentRow key={r.id} c={r} />)}
          {canComment ? (
            <div className="space-y-2">
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Reply…"
                rows={2}
                className="w-full resize-none rounded border border-zinc-700 bg-zinc-950 p-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  disabled={busy || !reply.trim()}
                  onClick={async () => { await onReply(root.id, reply.trim()); setReply("") }}
                >
                  Reply
                </Button>
                {resolved ? (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => onReopen(root.id)}>Reopen</Button>
                ) : (
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => onResolve(root.id)}>Resolve</Button>
                )}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/articles/CommentCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/cms/articles/CommentCard.tsx tests/articles/CommentCard.test.tsx
git commit -m "feat(cms): CommentCard with focus visuals (extracted from CommentPanel)"
```

---

### Task 3: `CommentGutter` component (desktop rail)

**Files:**
- Create: `components/cms/articles/CommentGutter.tsx`
- Test: `tests/articles/CommentGutter.test.tsx`

**Interfaces:**
- Consumes: `layoutCards`, `partitionThreads`, `DesiredCard`, `Thread` from `@/lib/cms/comment-layout`; `CommentCard` from `./CommentCard`.
- Produces: `CommentGutter(props)`:
  ```ts
  {
    threads: Thread[]                         // all threads for this locale/version
    focusedId: string | null
    showResolved: boolean
    onToggleResolved: () => void
    measureTop: (id: string) => number | null // mark Y relative to gutter top; null = not locatable
    reflowKey: number                          // bump to force re-measure
    canComment: boolean
    busy: boolean
    onFocus: (id: string | null) => void
    onReply: (parentId: string, body: string) => void | Promise<void>
    onResolve: (id: string) => void
    onReopen: (id: string) => void
  }
  ```
  Positioned OPEN cards are absolutely positioned at their `layoutCards` top. OPEN cards whose `measureTop` returns null join ORPHANED in a fixed "Unanchored" top section. Resolved render only when `showResolved`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/articles/CommentGutter.test.tsx
import { describe, it, expect, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"
import { CommentGutter } from "@/components/cms/articles/CommentGutter"
import type { Thread } from "@/lib/cms/comment-layout"

function thread(id: string, start: number | null, status: Thread["root"]["status"] = "OPEN", body = id): Thread {
  return {
    root: {
      id, articleId: "a", versionId: null, locale: "en",
      author: { id: "u", name: "U", avatarUrl: null },
      anchor: (start == null ? undefined : { quote: id, prefix: "", suffix: "", blockIndex: 0, start, end: start + 1 }) as Thread["root"]["anchor"],
      body, status, parentId: null,
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    },
    replies: [],
  }
}

const base = {
  focusedId: null,
  onToggleResolved: vi.fn(),
  // Every open thread is measurable; Y mirrors anchor.start for the test.
  measureTop: (id: string) => ({ b: 100, a: 10, c: 40 } as Record<string, number>)[id] ?? null,
  reflowKey: 0,
  canComment: true,
  busy: false,
  onFocus: vi.fn(),
  onReply: vi.fn(),
  onResolve: vi.fn(),
  onReopen: vi.fn(),
}

describe("CommentGutter", () => {
  it("renders open cards in document order", () => {
    render(<CommentGutter {...base} threads={[thread("b", 100), thread("a", 10), thread("c", 40)]} showResolved={false} />)
    const ids = Array.from(document.querySelectorAll("[data-comment-card]")).map((el) => el.getAttribute("data-comment-card"))
    expect(ids).toEqual(["a", "c", "b"])
  })

  it("hides resolved by default and shows them when toggled", () => {
    const threads = [thread("a", 10), thread("r", 5, "RESOLVED", "resolved body")]
    const { rerender } = render(<CommentGutter {...base} threads={threads} showResolved={false} />)
    expect(screen.queryByText("resolved body")).toBeNull()
    rerender(<CommentGutter {...base} threads={threads} showResolved />)
    expect(screen.getByText("resolved body")).toBeInTheDocument()
  })

  it("puts orphaned threads in an Unanchored top section", () => {
    render(<CommentGutter {...base} threads={[thread("a", 10), thread("orph", null, "ORPHANED", "lost body")]} showResolved={false} />)
    const section = screen.getByTestId("gutter-unanchored")
    expect(within(section).getByText("lost body")).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/articles/CommentGutter.test.tsx`
Expected: FAIL — cannot resolve `@/components/cms/articles/CommentGutter`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// components/cms/articles/CommentGutter.tsx
"use client"

// The desktop review rail: comment cards absolutely positioned at the Y of
// their highlighted text, in document order, with two-pass collision. Lives in
// the same scroll container as the article (no own overflow). Resolved cards are
// hidden behind a toggle; orphaned / unlocatable cards sit in a fixed top
// section outside the collision algorithm.

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { CommentCard } from "./CommentCard"
import { layoutCards, partitionThreads, type DesiredCard, type Thread } from "@/lib/cms/comment-layout"

const GAP = 12

export function CommentGutter({
  threads,
  focusedId,
  showResolved,
  onToggleResolved,
  measureTop,
  reflowKey,
  canComment,
  busy,
  onFocus,
  onReply,
  onResolve,
  onReopen,
}: {
  threads: Thread[]
  focusedId: string | null
  showResolved: boolean
  onToggleResolved: () => void
  measureTop: (id: string) => number | null
  reflowKey: number
  canComment: boolean
  busy: boolean
  onFocus: (id: string | null) => void
  onReply: (parentId: string, body: string) => void | Promise<void>
  onResolve: (id: string) => void
  onReopen: (id: string) => void
}) {
  const { open, resolved, orphaned } = partitionThreads(threads)

  const [heights, setHeights] = useState<Map<string, number>>(new Map())
  const [tops, setTops] = useState<Map<string, number>>(new Map())
  const wrapRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // Which open threads can we currently measure a Y for?
  const measured: DesiredCard[] = []
  const unlocated: Thread[] = []
  for (const t of open) {
    const top = measureTop(t.root.id)
    if (top == null) { unlocated.push(t); continue }
    measured.push({ id: t.root.id, top, height: heights.get(t.root.id) ?? 0 })
  }
  const openKey = open.map((t) => t.root.id).join(",")
  const measuredKey = measured.map((d) => `${d.id}:${d.top}`).join(",")

  // Run the collision layout whenever inputs change.
  useLayoutEffect(() => {
    setTops(layoutCards(measured, focusedId, GAP))
    // measuredKey folds in ids + desired tops; heights/reflowKey trigger re-measure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measuredKey, focusedId, heights, reflowKey])

  // Track live card heights (reply expansion, font swap) and re-layout.
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver((entries) => {
      setHeights((prev) => {
        const next = new Map(prev)
        let changed = false
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.cardWrap
          if (!id) continue
          const h = (e.target as HTMLElement).offsetHeight
          if (next.get(id) !== h) { next.set(id, h); changed = true }
        }
        return changed ? next : prev
      })
    })
    for (const el of wrapRefs.current.values()) ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey, focusedId])

  const positioned = open.filter((t) => tops.has(t.root.id))
  const topSection = [...orphaned, ...unlocated]

  function cardFor(t: Thread) {
    return (
      <CommentCard
        thread={t}
        focused={focusedId === t.root.id}
        dimmed={focusedId != null && focusedId !== t.root.id}
        canComment={canComment}
        busy={busy}
        onFocus={() => onFocus(focusedId === t.root.id ? null : t.root.id)}
        onReply={onReply}
        onResolve={onResolve}
        onReopen={onReopen}
      />
    )
  }

  return (
    <div className="relative h-full w-full text-left">
      <div className="mb-3 flex items-center justify-between px-1 text-xs">
        <span className="font-semibold text-zinc-300">Comments ({open.length})</span>
        {resolved.length > 0 ? (
          <button className="text-zinc-500 hover:text-zinc-200" onClick={onToggleResolved}>
            {showResolved ? "Hide" : "Show"} resolved ({resolved.length})
          </button>
        ) : null}
      </div>

      {topSection.length > 0 ? (
        <div data-testid="gutter-unanchored" className="mb-3 space-y-2 rounded-lg border border-amber-800/40 bg-amber-950/20 p-2">
          <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-amber-400/80">Unanchored</p>
          {topSection.map((t) => <div key={t.root.id}>{cardFor(t)}</div>)}
        </div>
      ) : null}

      {/* Absolutely positioned open cards. Height comes from the article, so the
          rail needs an explicit min-height to hold the lowest card. */}
      <div className="relative" style={{ minHeight: maxBottom(tops, heights) }}>
        {positioned.map((t) => (
          <div
            key={t.root.id}
            ref={(el) => {
              if (el) wrapRefs.current.set(t.root.id, el)
              else wrapRefs.current.delete(t.root.id)
            }}
            data-card-wrap={t.root.id}
            className="absolute left-0 right-0 transition-[top] duration-200 ease-out motion-reduce:transition-none"
            style={{ top: tops.get(t.root.id) ?? 0 }}
          >
            {cardFor(t)}
          </div>
        ))}
      </div>

      {showResolved && resolved.length > 0 ? (
        <div className="mt-4 space-y-2 border-t border-zinc-800 pt-3">
          <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Resolved</p>
          {resolved.map((t) => <div key={t.root.id}>{cardFor(t)}</div>)}
        </div>
      ) : null}
    </div>
  )
}

/** Bottom of the lowest positioned card, so the absolute container reserves height. */
function maxBottom(tops: Map<string, number>, heights: Map<string, number>): number {
  let max = 0
  for (const [id, top] of tops) max = Math.max(max, top + (heights.get(id) ?? 120))
  return max
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/articles/CommentGutter.test.tsx`
Expected: PASS. (happy-dom has no real layout; positioning is driven by the injected `measureTop`, so document order + partitioning assert cleanly.)

- [ ] **Step 5: Commit**

```bash
git add components/cms/articles/CommentGutter.tsx tests/articles/CommentGutter.test.tsx
git commit -m "feat(cms): CommentGutter — anchored, collision-resolved comment rail"
```

---

### Task 4: Wire the gutter into `AnnotatedArticle` (desktop)

**Files:**
- Modify: `components/cms/articles/comment-color.ts` (add `highlightColorStrong`)
- Modify: `components/cms/articles/AnnotatedArticle.tsx`

**Interfaces:**
- Consumes: `CommentGutter` (Task 3), `layoutCards`/`isInsideAny`/`Thread` (Task 1), `highlightColor` + new `highlightColorStrong` (`./comment-color`), the existing `CommentPanel` (mobile, unchanged until Task 5).
- Produces: no new exports. `AnnotatedArticle` now owns `focusedId`, `showResolved`, `reflowKey`, `measureTop`, mark saturation, and `pointerdown` dismiss. `buildThreads` returns `Thread` from `comment-layout` (drop the local `Thread` import from `CommentPanel`).

- [ ] **Step 1: Add `highlightColorStrong` to `comment-color.ts`**

Append after `highlightColor`:

```ts
/** Saturated fill for the focused/hovered highlight <mark>. */
export function highlightColorStrong(authorId: string): string {
  return `hsla(${authorHue(authorId)}, 85%, 55%, 0.5)`
}
```

- [ ] **Step 2: Rewrite `AnnotatedArticle.tsx`**

Replace the whole file with:

```tsx
"use client"

// WS5 — the annotation layer over the rendered article preview. Wraps the
// server-rendered <ArticleView> (children); on text selection it shows a
// "Comment" popover anchoring a comment to the selection, re-renders existing
// comments as per-author <mark> highlights, and lays out comment cards in a
// right-side gutter at the Y of their text (Google-Docs style). Mobile keeps a
// bottom-sheet. Also renders the review timeline.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  serializeSelection,
  locateAnchor,
  type TextAnchor,
} from "@/lib/cms/annotation-anchor"
import {
  addComment,
  resolveComment,
  reopenComment,
  type CommentDTO,
  type VersionDTO,
  type TimelineEntry,
} from "@/actions/cms/articles-review"
import { highlightColor, highlightColorStrong } from "./comment-color"
import { isInsideAny, type Thread } from "@/lib/cms/comment-layout"
import { CommentGutter } from "./CommentGutter"
import { CommentPanel } from "./CommentPanel"
import { ReviewTimeline } from "./ReviewTimeline"

type Locale = "en" | "zh"

interface PendingSelection {
  anchor: TextAnchor
  top: number
  left: number
  below: boolean
}

const POPOVER_CLEARANCE = 180

/** Group flat comments into root threads + replies (roots keep DB order; the
 *  gutter re-sorts by document position). */
function buildThreads(comments: CommentDTO[]): Thread[] {
  const roots = comments.filter((c) => !c.parentId)
  const byParent = new Map<string, CommentDTO[]>()
  for (const c of comments) {
    if (!c.parentId) continue
    const arr = byParent.get(c.parentId) ?? []
    arr.push(c)
    byParent.set(c.parentId, arr)
  }
  return roots.map((root) => ({ root, replies: byParent.get(root.id) ?? [] }))
}

export function AnnotatedArticle({
  articleId,
  locale,
  versionId,
  canComment,
  initialComments,
  versions,
  children,
}: {
  articleId: string
  locale: Locale
  versionId: string | null
  canComment: boolean
  initialComments: CommentDTO[]
  versions: VersionDTO[]
  children: React.ReactNode
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const gutterRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [comments, setComments] = useState<CommentDTO[]>(initialComments)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [showResolved, setShowResolved] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [reflowKey, setReflowKey] = useState(0)
  const [pending, setPending] = useState<PendingSelection | null>(null)
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)

  const threads = useMemo(() => buildThreads(comments), [comments])

  // Re-locate every root comment's anchor and wrap it in a per-author <mark>.
  const applyHighlights = useCallback(() => {
    const root = rootRef.current
    if (!root) return
    root.querySelectorAll("mark[data-comment-thread]").forEach((m) => {
      const parent = m.parentNode
      if (!parent) return
      while (m.firstChild) parent.insertBefore(m.firstChild, m)
      parent.removeChild(m)
      parent.normalize()
    })

    for (const { root: c } of threads) {
      if (c.status === "RESOLVED") continue
      const range = locateAnchor(c.anchor, root)
      if (!range) continue
      const nodes = textNodesInRange(range)
      for (const node of nodes) {
        const s = node === range.startContainer ? range.startOffset : 0
        const e = node === range.endContainer ? range.endOffset : node.data.length
        if (e <= s) continue
        let target = node
        if (s > 0) target = target.splitText(s)
        if (e - s < target.data.length) target.splitText(e - s)
        const mark = root.ownerDocument.createElement("mark")
        mark.dataset.commentThread = c.id
        mark.style.background = highlightColor(c.author.id)
        mark.style.borderRadius = "2px"
        mark.style.cursor = "pointer"
        mark.style.color = "inherit"
        target.parentNode?.insertBefore(mark, target)
        mark.appendChild(target)
      }
    }
  }, [threads])

  // Apply highlights after render / when comments change, then trigger a reflow.
  useEffect(() => {
    applyHighlights()
    setReflowKey((k) => k + 1)
  }, [applyHighlights])

  // Saturate the focused comment's marks; reset the rest.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    root.querySelectorAll<HTMLElement>("mark[data-comment-thread]").forEach((m) => {
      const cid = m.dataset.commentThread
      if (!cid) return
      const author = comments.find((c) => c.id === cid)?.author.id ?? cid
      const on = cid === focusedId
      m.style.background = on ? highlightColorStrong(author) : highlightColor(author)
      m.style.outline = on ? "1px solid rgba(255,255,255,0.35)" : "none"
    })
  }, [focusedId, comments])

  // Reflow the gutter on container resize + lazy image loads.
  useEffect(() => {
    const root = rootRef.current
    if (!root || typeof ResizeObserver === "undefined") return
    const bump = () => setReflowKey((k) => k + 1)
    const ro = new ResizeObserver(bump)
    ro.observe(root)
    const imgs = Array.from(root.querySelectorAll("img"))
    imgs.forEach((img) => { if (!img.complete) img.addEventListener("load", bump) })
    return () => {
      ro.disconnect()
      imgs.forEach((img) => img.removeEventListener("load", bump))
    }
  }, [comments])

  // Measure a comment's first mark Y, relative to the gutter's top. null when the
  // mark is absent (anchor drifted) — the gutter then treats it as unanchored.
  const measureTop = useCallback((id: string): number | null => {
    const gutter = gutterRef.current
    const root = rootRef.current
    if (!gutter || !root) return null
    const mark = root.querySelector<HTMLElement>(`mark[data-comment-thread="${id}"]`)
    if (!mark) return null
    const rects = mark.getClientRects()
    if (rects.length === 0) return null
    return rects[0].top - gutter.getBoundingClientRect().top
  }, [])

  // Show the "Comment" popover on text selection inside the article.
  useEffect(() => {
    if (!canComment) return
    function onSelect(ev: MouseEvent | TouchEvent) {
      if (ev.target instanceof Node && popoverRef.current?.contains(ev.target)) return
      const sel = window.getSelection()
      const root = rootRef.current
      if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !root) { setPending(null); return }
      const range = sel.getRangeAt(0)
      if (!root.contains(range.commonAncestorContainer) || range.toString().trim().length === 0) { setPending(null); return }
      const anchor = serializeSelection(range, root)
      const rect = range.getBoundingClientRect()
      const below = rect.top < POPOVER_CLEARANCE
      const mid = rect.left + rect.width / 2
      const left = Math.min(Math.max(mid, 140), Math.max(140, window.innerWidth - 140))
      setPending({
        anchor,
        top: below ? Math.min(rect.bottom + 8, window.innerHeight - 8) : rect.top - 8,
        left,
        below,
      })
      setDraft("")
    }
    document.addEventListener("mouseup", onSelect)
    document.addEventListener("touchend", onSelect)
    return () => {
      document.removeEventListener("mouseup", onSelect)
      document.removeEventListener("touchend", onSelect)
    }
  }, [canComment])

  // Defocus when a pointer goes down outside the gutter / sheet / popover / a mark.
  // pointerdown + containment (never click/mouseup — the #202 "eats the click" bug).
  useEffect(() => {
    function onDown(ev: PointerEvent) {
      const t = ev.target as Node | null
      if (isInsideAny(t, [gutterRef.current, sheetRef.current, popoverRef.current])) return
      if (t instanceof HTMLElement && t.closest("mark[data-comment-thread]")) return
      setFocusedId(null)
    }
    document.addEventListener("pointerdown", onDown)
    return () => document.removeEventListener("pointerdown", onDown)
  }, [])

  // Click a highlight → focus its card. The document does NOT scroll.
  function onRootClick(ev: React.MouseEvent) {
    const el = (ev.target as HTMLElement).closest?.("mark[data-comment-thread]") as HTMLElement | null
    if (el?.dataset.commentThread) {
      setFocusedId(el.dataset.commentThread)
      setSheetOpen(true) // mobile: reveal the sheet on the tapped thread
    }
  }

  // Click a card → focus it and gently scroll the article to the trecho.
  function focusFromCard(id: string | null) {
    setFocusedId(id)
    if (!id) return
    const mark = rootRef.current?.querySelector<HTMLElement>(`mark[data-comment-thread="${id}"]`)
    mark?.scrollIntoView({ block: "center", behavior: "smooth" })
  }

  async function submitComment() {
    if (!pending || !draft.trim()) return
    setBusy(true)
    try {
      const res = await addComment({ articleId, versionId, locale, anchor: pending.anchor, body: draft.trim() })
      if (res.ok) {
        setComments((prev) => [...prev, res.comment])
        setPending(null)
        setDraft("")
        setFocusedId(res.comment.id)
        window.getSelection()?.removeAllRanges()
      }
    } finally {
      setBusy(false)
    }
  }

  async function submitReply(parentId: string, body: string) {
    const parent = comments.find((c) => c.id === parentId)
    if (!parent) return
    setBusy(true)
    try {
      const res = await addComment({ articleId, versionId, locale, anchor: parent.anchor, body, parentId })
      if (res.ok) setComments((prev) => [...prev, res.comment])
    } finally {
      setBusy(false)
    }
  }

  async function doResolve(id: string) {
    setBusy(true)
    try {
      const res = await resolveComment(id)
      if (res.ok) setComments((prev) => prev.map((c) => (c.id === id ? res.comment : c)))
    } finally {
      setBusy(false)
    }
  }

  async function doReopen(id: string) {
    setBusy(true)
    try {
      const res = await reopenComment(id)
      if (res.ok) setComments((prev) => prev.map((c) => (c.id === id ? res.comment : c)))
    } finally {
      setBusy(false)
    }
  }

  const timeline = useMemo<TimelineEntry[]>(() => {
    const versionEntries: TimelineEntry[] = versions.map((v) => ({ kind: "version", at: v.createdAt, ...v }))
    const commentEntries: TimelineEntry[] = comments.map((c) => ({ kind: "comment", at: c.createdAt, ...c }))
    return [...versionEntries, ...commentEntries].sort((a, b) => a.at.localeCompare(b.at))
  }, [versions, comments])

  return (
    <div className="relative">
      {/* Article + timeline. On desktop, reserve the right band for the gutter. */}
      <div className="min-w-0 lg:pr-[340px]">
        <div ref={rootRef} onClick={onRootClick}>
          {children}
        </div>

        <div className="mx-auto max-w-[680px] px-6 pb-16 sm:px-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Review timeline</h2>
          <ReviewTimeline entries={timeline} />
        </div>
      </div>

      {/* Desktop gutter: absolutely positioned in the shared scroll container. */}
      <div ref={gutterRef} className="absolute right-4 top-0 hidden h-full w-[300px] lg:block">
        <CommentGutter
          threads={threads}
          focusedId={focusedId}
          showResolved={showResolved}
          onToggleResolved={() => setShowResolved((s) => !s)}
          measureTop={measureTop}
          reflowKey={reflowKey}
          canComment={canComment}
          busy={busy}
          onFocus={focusFromCard}
          onReply={submitReply}
          onResolve={doResolve}
          onReopen={doReopen}
        />
      </div>

      {/* Mobile bottom-sheet (Task 5 upgrades this to CommentCard + doc order). */}
      <div ref={sheetRef} className={`lg:hidden ${sheetOpen ? "" : "hidden"}`}>
        <CommentPanel
          threads={threads}
          selectedId={focusedId}
          canComment={canComment}
          busy={busy}
          onSelect={setFocusedId}
          onReply={submitReply}
          onResolve={doResolve}
          onReopen={doReopen}
          onClose={() => setSheetOpen(false)}
        />
      </div>

      {!sheetOpen ? (
        <button
          onClick={() => setSheetOpen(true)}
          className="fixed bottom-4 right-4 z-20 rounded-full bg-zinc-800 px-4 py-2 text-sm text-white shadow-lg lg:hidden"
        >
          Comments ({threads.length})
        </button>
      ) : null}

      {/* Selection → comment popover. */}
      {pending ? (
        <div
          ref={popoverRef}
          data-below={pending.below || undefined}
          className={`fixed z-40 w-64 -translate-x-1/2 rounded-lg border border-zinc-700 bg-zinc-950 p-2 shadow-xl ${pending.below ? "" : "-translate-y-full"}`}
          style={{ top: pending.top, left: pending.left }}
        >
          <p className="mb-1 line-clamp-2 text-[11px] italic text-zinc-500">“{pending.anchor.quote}”</p>
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a comment…"
            rows={2}
            className="w-full resize-none rounded border border-zinc-700 bg-zinc-900 p-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
          />
          <div className="mt-1 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setPending(null)}>Cancel</Button>
            <Button size="sm" disabled={busy || !draft.trim()} onClick={submitComment}>Comment</Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** Text nodes intersecting a Range (whose boundaries are text nodes). */
function textNodesInRange(range: Range): Text[] {
  const rootNode = range.commonAncestorContainer
  const scope = (rootNode.nodeType === 1 ? rootNode : rootNode.parentNode) as Node
  const doc = scope.ownerDocument!
  const walker = doc.createTreeWalker(scope, 0x4 /* SHOW_TEXT */)
  const out: Text[] = []
  let n: Node | null
  let started = false
  while ((n = walker.nextNode())) {
    const t = n as Text
    if (t === range.startContainer) started = true
    if (started) out.push(t)
    if (t === range.endContainer) break
  }
  if (out.length === 0 && range.startContainer.nodeType === 3) out.push(range.startContainer as Text)
  return out
}
```

- [ ] **Step 3: Typecheck + full test + lint**

Run: `pnpm tsc --noEmit`
Expected: no errors.

Run: `pnpm vitest run tests/articles/`
Expected: PASS (layout + card + gutter + existing annotation-anchor tests).

Run: `pnpm lint`
Expected: 0 errors (pre-existing warnings allowed).

- [ ] **Step 4: Manual verification in preview** (getClientRects / focus / dismiss cannot be exercised under happy-dom)

Start the dev server and open a preview with several comments (the lending draft `cmrezq9ru002t5mso3kdap6tn` is a real candidate once reviewed). Verify on a `≥ lg` viewport:
1. Each card sits at the vertical position of its highlighted text, in document order (comment on paragraph 10 is near paragraph 10, not at the top).
2. Overlapping comments stack with a gap; focusing one (click its card) pins it at its exact Y and neighbours cede space with a 200ms `top` transition.
3. Click a mark → its card focuses and the mark saturates; the document does NOT scroll. Click a card → the mark saturates, the card slides ~8px toward the text, others dim, and the article gently scrolls the trecho into view.
4. Resolve a comment → it disappears from the margin; "Show resolved (n)" reveals it.
5. Click empty space → focus clears (pointerdown dismiss); clicking inside a card's Reply box does NOT clear focus or eat the click (regression check for #202).
6. `< lg` viewport: FAB + bottom-sheet still work; tapping a highlight opens the sheet.

- [ ] **Step 5: Commit**

```bash
git add components/cms/articles/AnnotatedArticle.tsx components/cms/articles/comment-color.ts
git commit -m "feat(cms): anchored comment gutter with bidirectional focus in preview"
```

---

### Task 5: Convert `CommentPanel` to a document-ordered mobile bottom-sheet

**Files:**
- Modify: `components/cms/articles/CommentPanel.tsx`

**Interfaces:**
- Consumes: `CommentCard` (Task 2), `orderThreadsByAnchor` + `Thread` (Task 1).
- Produces: same `CommentPanel` prop signature as today (so `AnnotatedArticle` from Task 4 needs no change):
  ```ts
  {
    threads: Thread[]
    selectedId: string | null
    canComment: boolean
    busy: boolean
    onSelect: (id: string | null) => void
    onReply: (parentId: string, body: string) => void | Promise<void>
    onResolve: (id: string) => void
    onReopen: (id: string) => void
    onClose: () => void
  }
  ```
  Now a mobile-only bottom-sheet: threads ordered by document position, rendered as `CommentCard`s, auto-scrolled to `selectedId` when it changes. The old `CommentRow` and the DB-ordered list are removed (CommentRow now lives in `CommentCard`).

- [ ] **Step 1: Rewrite `CommentPanel.tsx`**

```tsx
"use client"

// WS5 — the mobile review bottom-sheet. Desktop uses <CommentGutter>; below lg
// this sheet lists every thread in document order (reusing <CommentCard>) and
// scrolls to the selected thread when it opens. Purely presentational — all
// mutations are delegated to callbacks owned by AnnotatedArticle.

import { useEffect, useRef } from "react"
import { CommentCard } from "./CommentCard"
import { orderThreadsByAnchor, type Thread } from "@/lib/cms/comment-layout"

export type { Thread }

export function CommentPanel({
  threads,
  selectedId,
  canComment,
  busy,
  onSelect,
  onReply,
  onResolve,
  onReopen,
  onClose,
}: {
  threads: Thread[]
  selectedId: string | null
  canComment: boolean
  busy: boolean
  onSelect: (id: string | null) => void
  onReply: (parentId: string, body: string) => void | Promise<void>
  onResolve: (id: string) => void
  onReopen: (id: string) => void
  onClose: () => void
}) {
  const listRef = useRef<HTMLDivElement>(null)
  const ordered = orderThreadsByAnchor(threads)

  // When a thread is selected (e.g. tapping its highlight), scroll it into view.
  useEffect(() => {
    if (!selectedId) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-sheet-thread="${selectedId}"]`)
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [selectedId])

  return (
    <aside
      className="fixed inset-x-0 bottom-0 z-30 flex max-h-[70vh] flex-col rounded-t-2xl border-t border-zinc-800 bg-zinc-950 shadow-2xl"
      aria-label="Review comments"
    >
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-100">
          Comments <span className="text-zinc-500">({threads.length})</span>
        </h2>
        <button onClick={onClose} className="text-zinc-500 hover:text-white" aria-label="Close comments">✕</button>
      </div>

      <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto p-3">
        {ordered.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-zinc-500">
            Select text in the article to leave a comment.
          </p>
        ) : null}

        {ordered.map((t) => (
          <div key={t.root.id} data-sheet-thread={t.root.id}>
            <CommentCard
              thread={t}
              focused={selectedId === t.root.id}
              dimmed={false}
              canComment={canComment}
              busy={busy}
              onFocus={() => onSelect(selectedId === t.root.id ? null : t.root.id)}
              onReply={onReply}
              onResolve={onResolve}
              onReopen={onReopen}
            />
          </div>
        ))}
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Typecheck + full test**

Run: `pnpm tsc --noEmit`
Expected: no errors (the `Thread` re-export keeps any incidental importers happy).

Run: `pnpm vitest run tests/articles/`
Expected: PASS.

- [ ] **Step 3: Manual verification in preview (mobile)**

At a `< lg` viewport: tap the FAB → sheet opens ordered by document position; tap a highlight → sheet opens scrolled to that thread; reply/resolve work; `✕` closes.

- [ ] **Step 4: Commit**

```bash
git add components/cms/articles/CommentPanel.tsx
git commit -m "feat(cms): CommentPanel becomes a document-ordered mobile sheet reusing CommentCard"
```

---

### Task 6: Ship — gate, spec, PR

**Files:** none (integration + docs already staged).

- [ ] **Step 1: Full gate**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm vitest run`
Expected: tsc clean; lint 0 errors; vitest green except the pre-existing allow-listed failures (admin-nav / admin-landing / frbtc-indexer). Confirm the three new test files pass.

- [ ] **Step 2: Build**

Run: `pnpm build`
Expected: successful production build.

- [ ] **Step 3: Stage the spec + plan and open the PR**

```bash
git add docs/superpowers/specs/2026-07-10-review-comments-gdocs-margin-design.md \
        docs/superpowers/plans/2026-07-10-review-comments-gdocs-margin.md
git commit -m "docs(cms): review-comments gutter spec + implementation plan"
git push -u origin <branch>
gh pr create --title "Review comments: Google-Docs-style anchored margin" --body "<summary + screenshots>"
```

- [ ] **Step 4: After merge — deploy**

Wait for "Deploy to GCP" (flaky; re-run if needed) → capture the full merge-commit SHA → bump `newTag` (SHA in quotes) in `k8s/kustomization.yaml` → push a `deploy(io):` commit straight to `main` → Flux reconciles (~1 min) → `kubectl rollout status`. Verify on prod `/admin/articles/<id>/preview`.

---

## Self-Review

**1. Spec coverage**

| Spec requirement | Task |
|---|---|
| Cards absolute in a right gutter, same scroll container | Task 4 (relative wrapper + absolute gutter, `lg:pr-[340px]`) |
| Pure `layout(desired, focused, gap)`, two-pass | Task 1 `layoutCards` |
| Document order by anchor (not createdAt) | Task 1 `orderThreadsByAnchor` |
| Mark Y via `getClientRects()[0]` minus gutter top | Task 4 `measureTop` |
| Card heights via ResizeObserver, layout in useLayoutEffect | Task 3 |
| Reflow on container resize + image load | Task 4 reflow effect |
| Click mark → focus, no doc scroll | Task 4 `onRootClick` |
| Click card → saturate mark + `translateX(-8px)` + dim others + optional scroll | Task 2 (visuals) + Task 4 `focusFromCard`, saturation effect |
| `transition top 200ms`, reduced-motion | Task 2/3 classes |
| pointerdown + containment dismiss (#202) | Task 1 `isInsideAny` + Task 4 dismiss effect |
| Resolved hidden by default + toggle | Task 3 |
| Orphaned in fixed top section, no invented Y | Task 3 (`gutter-unanchored`) |
| Mobile bottom-sheet, doc order, open-scrolled-to-thread | Task 5 |
| Kill CommentPanel list variant | Task 5 |
| Unit + structural tests | Tasks 1/2/3 |
| Backend unchanged | Global constraint (no server files in any task) |

No gaps.

**2. Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step is complete; `<branch>`/`<summary>` in Task 6 are genuine fill-ins for the human at ship time, not code placeholders.

**3. Type consistency:** `Thread` defined once in `comment-layout.ts`, imported by `CommentCard`, `CommentGutter`, `CommentPanel`, `AnnotatedArticle`. `CommentCard` prop names (`thread`, `focused`, `dimmed`, `onFocus`, `onReply`, `onResolve`, `onReopen`) used identically in Tasks 3 and 5. `CommentGutter` prop `measureTop: (id) => number | null` matches Task 4's `measureTop`. `CommentPanel` keeps its exact current signature so Task 4's usage compiles before Task 5 runs. `highlightColorStrong` added in Task 4 before use.
