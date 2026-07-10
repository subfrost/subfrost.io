# Spec — Review comments: Google-Docs-style anchored margin

**Date:** 2026-07-10 · **Requested by:** Vitor (CMO) · **Advisor:** Fable 5 · **Scope:** v1 essential

## Goal
Redesign the article-review comment UI (`/admin/articles/[id]/preview`) so comments read like
Google Docs: each comment card sits in the right margin **at the same vertical position (Y) as its
highlighted text**, in **document order**, with bidirectional focus. Today the panel lists all
comments in DB order in a fixed-width sidebar, so a comment on paragraph 10 shows up at the top,
far from its text ("os comentários ficam em cima e não perto do lugar").

## Non-goals (unchanged / out of scope)
- **Backend is unchanged.** `ArticleComment` (W3C TextQuote anchor), `addComment`/`resolveComment`/
  `reopenComment`, the timeline, ORPHANED status, highlight-by-author — all stay. This is a
  **frontend/layout** change only.
- No new comment features (no @mentions, no reactions, no rich text).
- No connector line (v1), no collapsed-avatar rail, no comment clustering, no minimap, no
  virtualization. (Fable: doesn't pay for an internal tool with tens of comments.)

## Current state (what we're replacing)
- `app/admin/articles/[id]/preview/page.tsx` → `EditorialThemeScope` → `AnnotatedArticle` (client;
  wraps the server `ArticleView`).
- `AnnotatedArticle` (`components/cms/articles/AnnotatedArticle.tsx`): `flex flex-col sm:flex-row`,
  article (`flex-1`) + `CommentPanel` (`aside`). Applies highlights by re-locating each root
  comment's anchor and wrapping it in a colored `<mark data-comment-thread>`. Selection → "Comment"
  popover. Click a mark → open its thread in the panel.
- `CommentPanel` (`components/cms/articles/CommentPanel.tsx`): fixed `sm:w-80` `aside` that **lists
  every thread in DB order**, `sm:static`; selected thread expands with replies + resolve. On mobile
  it's a bottom-sheet + FAB. **This DB-ordered list is the thing to replace.**

## Target architecture (Fable-validated)
Kill `CommentPanel` as a list. Comment cards become **absolutely-positioned children of a right-side
gutter** that lives inside the **same scroll container** as the article (a shared `relative`
wrapper), so the gutter scrolls with the text and Y-alignment is possible by construction.

**The one hard rule:** no second scroll container. The old `aside` with its own overflow is gone.

### Layout math (pure, testable)
A pure function drives all card positions:
```
layout(desired: {id, top, height}[], focusedId | null, gap) -> Map<id, top>
```
- `desired[i].top` = Y of the mark (see measurement) relative to the gutter's top; input is **sorted
  by anchor position in the document** (not createdAt).
- **No focus:** top-down sweep — `top[i] = max(desired[i], top[i-1] + height[i-1] + gap)`.
- **With focus:** pin the focused card at its exact desired Y. Cards **below** it: same top-down
  sweep starting there. Cards **above** it: bottom-up sweep — `top[i] = min(desired[i],
  top[i+1] - height[i] - gap)`. (This is what makes the others "cede space".)
- O(n), two passes. No constraint solver, no fisheye. Unit-tested without a DOM (~30 lines).

### Measurement & reflow
- **Mark Y:** use `mark.getClientRects()[0]` (not `getBoundingClientRect()`) so a multi-line
  highlight anchors to the **start** of the quote, minus the gutter's top offset.
- **Card heights:** measured live via a `ResizeObserver` per card (reply/thread height varies); store
  in state; run `layout()` in `useLayoutEffect`.
- **Reflow triggers:** one `ResizeObserver` on the article container (covers window resize, lazy
  images, web-font swap, comment edits changing article height) + the per-card observers. Recompute
  desired Ys + re-run layout.

### Focus behavior (paired, both ends)
- **Click a `<mark>`** → focus its card: cards move to give it the exact Y; **the document does NOT
  scroll** (moving the text yanks the reader out of place). Mark saturates.
- **Click a card** → saturate its mark; card gets elevation/border and **slides ~8px toward the text
  (`translateX(-8px)`)** while the others dim slightly. This 8px move is the "physical link" that
  replaces a connector line. Optionally, clicking the card *may* scroll the article to the trecho
  (the user asked to go there).
- **Transitions:** `transition: top 200ms ease-out` on cards (positional) + the focus state changes.
  Respect `prefers-reduced-motion`.
- **Dismiss/defocus:** use `pointerdown` + containment check, NOT `click`/`mouseup` (the
  "element eats the click" bug bit this exact component before — #202 / the WS5 popover). 

### Hygiene
- **Resolved comments are hidden from the margin by default**, with a header toggle "Show resolved"
  (count shown). Otherwise the gutter fills with dead cards and Y-alignment loses meaning.
- **ORPHANED comments** (anchor no longer locates → no Y) go in a **fixed section pinned at the top
  of the gutter**, visually distinct, outside the collision algorithm. Never invent a Y for them.

### Mobile (< ~1050px viewport: 680px article + ~300px gutter needs the width)
- Keep the **bottom-sheet** (it's Google Docs' own mobile pattern). Two cheap wins:
  (a) tapping a highlight opens the sheet **scrolled to that thread**, not the whole list from the
  top; (b) order threads by document position inside the sheet too.
- Optional (only if time): a small count dot on the right edge of a commented paragraph as a tap
  affordance.

## Components
- **`AnnotatedArticle`** — refactor: keep highlight application + selection popover + comment state
  (`addComment`, replies, resolve/reopen). Replace the `flex-row` + `CommentPanel` with the shared
  scroll wrapper + `<CommentGutter>` (desktop) / bottom-sheet (mobile). Owns focusedId.
- **`CommentGutter`** (new, desktop) — the absolutely-positioned rail: reads mark rects, runs
  `layout()`, renders `<CommentCard>`s at their computed `top`, plus the orphan section + resolved
  toggle.
- **`CommentCard`** (new) — one thread: quote, author row, body, replies, reply/resolve composer,
  focus visuals. Reuses `CommentRow`/`comment-color` from today's `CommentPanel`.
- **`lib/cms/comment-layout.ts`** (new, pure) — `layout()` + helpers. Unit-tested.
- **`CommentPanel`** — retire the list variant; the mobile sheet can reuse `CommentCard`s.

## Testing
- **Unit:** `comment-layout.test.ts` — no-focus stacking, focus pins + above/below cede, gap
  respected, single card, empty. Pure function, no DOM.
- **Structural/behavior:** cards render in document order; resolved hidden by default; orphan section
  present when an anchor fails; `pointerdown` dismiss doesn't eat the composer click (regression of
  #202).

## Rollout
- PR on `subfrost.io` (branch → PR → merge; deploy via Flux bump). Standard gate: tsc / eslint /
  vitest / build. It's admin-only UI, no public surface, low risk.

## Open questions
None blocking. Connector line deferred to a possible v2. Optional card→trecho scroll-on-click:
implement as a subtle default (can toggle off if it feels jumpy in review).
