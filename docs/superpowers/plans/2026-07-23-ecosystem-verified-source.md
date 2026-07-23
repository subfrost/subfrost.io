# Ecosystem "Verified source" tab + explorer repoint: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each `/ecosystem/<slug>` profile whose contract is verified a **Source** tab showing the explorer's attestation (verdict, byte match, source repo, commit) with a link out to the explorer's own source browser, and remove the last `espo.sh` links from the directory.

**Architecture:** One server-side reader (`lib/ecosystem/verified-source.ts`) calls the explorer's source-browser API and returns `null` on every unhappy path. One server component renders it. The profile page fetches it after the profile resolves and passes it down; `ProfileBody` appends a tab when it is non-null. No client-side code, no new dependency, no schema change.

**Tech Stack:** Next.js 16 (App Router, server components), TypeScript, Tailwind with `--ed-*` tokens, Vitest + Testing Library, pnpm.

## Global Constraints

- **Package manager is `pnpm`.** There is no `typecheck` script: use `node_modules/.bin/tsc --noEmit`. Tests: `node_modules/.bin/vitest run tests/ecosystem/`.
- **Work in the worktree** `C:\Alkanes Geral Dev\subfrost.io\.worktrees\eco-verified-source`, branch `feat/ecosystem-verified-source`. Never commit to `main`.
- **No new dependency.** Nothing gets added to `package.json`.
- **Zero em-dash** (`—` and `–`, and `——` in ZH) in any user-facing copy. Use a colon, a comma, parentheses or a full stop.
- **All public copy ships EN and ZH.** Both live in the `copy` record in `app/ecosystem/[slug]/page.tsx`.
- **Never call the explorer API from the browser.** The API key is a path segment; a client component would leak it. Every call is server-side.
- **`git add` by name**, never `git add -A` or `git add .`.
- **Assert on values and hrefs, never on labels.** A `/ecosystem` test passed for weeks after the label it queried stopped existing. Every guard added here must be confirmed to fail in the opposite direction.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/ecosystem/verified-source.ts` | **Create.** Reads one attestation from the explorer. Validates and narrows; returns `null` on any failure. Exports `repoShortName`. |
| `components/ecosystem/VerifiedSource.tsx` | **Create.** Server component. Renders the attestation, owns its own `<h2>`. |
| `components/ecosystem/EcosystemProfile.tsx` | **Modify.** New `verified` prop, the Source tab, and the `ContractsTable` repoint. |
| `app/ecosystem/[slug]/page.tsx` | **Modify.** Fetches the attestation, adds EN/ZH copy. |
| `tests/ecosystem/verified-source.test.ts` | **Create.** Unit tests for the reader. |
| `tests/ecosystem/verified-source-panel.test.tsx` | **Create.** Component tests. |
| `tests/ecosystem/profile-page.test.tsx` | **Modify.** Repoint assertion, plus tab presence and absence. |

---

### Task 1: The attestation reader

**Files:**
- Create: `lib/ecosystem/verified-source.ts`
- Test: `tests/ecosystem/verified-source.test.ts`

**Interfaces:**
- Consumes: `isValidAlkaneId`, `isValidHttpUrl` from `@/lib/ecosystem/constants` (both already exist).
- Produces: `fetchVerifiedSource(alkaneId: string, fetchImpl?: typeof fetch): Promise<VerifiedSource | null>`, `repoShortName(repo: string): string`, and the exported types `VerifiedSource`, `SourceVerdict`, `SourceOrigin`. Tasks 2, 4 and 5 depend on these exact names.

- [ ] **Step 1: Write the failing test**

Create `tests/ecosystem/verified-source.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest"
import { fetchVerifiedSource, repoShortName } from "@/lib/ecosystem/verified-source"

// Shape copied from a real response of
// GET https://explorer.subfrost.io/api/v1/subfrost/source/32/0 (frBTC, 2026-07-23).
const FRBTC = {
  ok: true,
  source: {
    alkane: "32:0", block: "32", tx: "0",
    verified: true, verdict: "verified", match_pct: 98.69,
    origin: "db",
    repo: "https://github.com/subfrost/subfrost-alkanes",
    owner: "subfrost", name: "subfrost-alkanes",
    commit: "0748786d1eede608b56ecf1331fe9e1a7c65d463",
    subdir: "alkanes/fr-btc", package: "alkanes/fr-btc",
    entrypoint: "alkanes/fr-btc/src/lib.rs",
    private: true, fileCount: 8,
  },
}

const resOk = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response
const resStatus = (status: number) => ({ ok: false, status, json: async () => ({}) }) as unknown as Response
/** Deep-clones FRBTC and overrides one field of `source`. */
const withSource = (over: Record<string, unknown>) =>
  resOk({ ok: true, source: { ...FRBTC.source, ...over } })

describe("fetchVerifiedSource", () => {
  it("maps a real verified response, including match_pct to matchPct", async () => {
    const fetchImpl = vi.fn(async () => resOk(FRBTC))
    const v = await fetchVerifiedSource("32:0", fetchImpl as never)
    expect(v).toEqual({
      alkaneId: "32:0",
      verdict: "verified",
      matchPct: 98.69,
      origin: "db",
      repo: "https://github.com/subfrost/subfrost-alkanes",
      commit: "0748786d1eede608b56ecf1331fe9e1a7c65d463",
    })
  })

  it("requests /{block}/{tx} built from the alkane id", async () => {
    const fetchImpl = vi.fn(async () => resOk(FRBTC))
    await fetchVerifiedSource("32:0", fetchImpl as never)
    const url = String((fetchImpl.mock.calls[0] as never[])[0])
    expect(url.endsWith("/32/0")).toBe(true)
  })

  it("returns null for every failing HTTP status", async () => {
    for (const status of [400, 401, 404, 500, 502]) {
      expect(await fetchVerifiedSource("32:0", vi.fn(async () => resStatus(status)) as never)).toBeNull()
    }
  })

  it("returns null when the network throws or the body is not JSON", async () => {
    expect(await fetchVerifiedSource("32:0", vi.fn(async () => { throw new Error("down") }) as never)).toBeNull()
    expect(await fetchVerifiedSource("32:0", vi.fn(async () => (
      { ok: true, status: 200, json: async () => { throw new Error("not json") } }
    ) as never) as never)).toBeNull()
  })

  it("returns null when the alkane is not verified", async () => {
    expect(await fetchVerifiedSource("32:0", vi.fn(async () => withSource({ verified: false })) as never)).toBeNull()
    expect(await fetchVerifiedSource("32:0", vi.fn(async () => resOk({ ok: false, error: "no verified source for this alkane" })) as never)).toBeNull()
  })

  it("returns null on a verdict outside the two badge-carrying outcomes", async () => {
    for (const verdict of ["pending", "failed", "", null]) {
      expect(await fetchVerifiedSource("32:0", vi.fn(async () => withSource({ verdict })) as never)).toBeNull()
    }
  })

  it("returns null on an out-of-range or non-numeric match_pct", async () => {
    for (const match_pct of [null, "98.7", Number.NaN, Number.POSITIVE_INFINITY, -1, 101]) {
      expect(await fetchVerifiedSource("32:0", vi.fn(async () => withSource({ match_pct })) as never)).toBeNull()
    }
  })

  it("returns null on an unusable repo or commit", async () => {
    expect(await fetchVerifiedSource("32:0", vi.fn(async () => withSource({ repo: "not-a-url" })) as never)).toBeNull()
    expect(await fetchVerifiedSource("32:0", vi.fn(async () => withSource({ repo: null })) as never)).toBeNull()
    expect(await fetchVerifiedSource("32:0", vi.fn(async () => withSource({ commit: "" })) as never)).toBeNull()
  })

  it("returns null on an unknown origin, which decides whether we link to GitHub", async () => {
    expect(await fetchVerifiedSource("32:0", vi.fn(async () => withSource({ origin: "s3" })) as never)).toBeNull()
  })

  it("rejects a malformed alkane id without calling the network", async () => {
    const fetchImpl = vi.fn(async () => resOk(FRBTC))
    expect(await fetchVerifiedSource("nope", fetchImpl as never)).toBeNull()
    expect(await fetchVerifiedSource("", fetchImpl as never)).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe("repoShortName", () => {
  it("strips the GitHub host and any trailing .git or slash", () => {
    expect(repoShortName("https://github.com/subfrost/subfrost-alkanes")).toBe("subfrost/subfrost-alkanes")
    expect(repoShortName("https://github.com/Misha-btc/Acai.git")).toBe("Misha-btc/Acai")
    expect(repoShortName("https://github.com/kungfuflex/fire/")).toBe("kungfuflex/fire")
  })

  it("leaves a non-GitHub URL recognisable rather than mangling it", () => {
    expect(repoShortName("https://gitlab.com/x/y")).toBe("https://gitlab.com/x/y")
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails for the right reason**

```bash
node_modules/.bin/vitest run tests/ecosystem/verified-source.test.ts
```

Expected: FAIL, `Failed to resolve import "@/lib/ecosystem/verified-source"`. If it fails with any other message, stop and read it: the module path is wrong.

- [ ] **Step 3: Write the implementation**

Create `lib/ecosystem/verified-source.ts`:

```ts
/**
 * Verified-source attestation for one alkane, read from the SUBFROST explorer's
 * source-browser API (explorer.subfrost.io/docs/source-browser, shipped 2026-07-23).
 *
 * Returns null on ANY failure and on any alkane that has not verified, so the caller can
 * treat "this contract has no attestation" and "the explorer is down" identically. That
 * matters: the explorer's own alkane pages were serving "Backend temporarily unavailable"
 * for at least 13 minutes on 2026-07-23 while this API answered 200 throughout.
 *
 * Server-side only. The API key travels as a PATH SEGMENT, so calling this from a client
 * component would publish it.
 */
import { isValidAlkaneId, isValidHttpUrl } from "@/lib/ecosystem/constants"

/**
 * Default carries the working service key, matching how SUBFROST_RPC_URL is handled in
 * lib/ecosystem/simulate.ts. `subfrost` is the gateway's service key (flex, 2026-07-22:
 * "subfrost key should just be /v4/subfrost"), and the source API validates against the
 * same key store. No secret has to exist for this to work in CI or locally.
 */
const API_BASE =
  process.env.EXPLORER_SOURCE_API || "https://explorer.subfrost.io/api/v1/subfrost/source"

/** `reproducible` = byte-exact rebuild. `verified` = same logic, small host-dependent residual. */
export type SourceVerdict = "reproducible" | "verified"

/**
 * Where the explorer serves the source from. `db` is its own byte-for-byte copy of the tree
 * the sandbox reproduced, which is how private repos stay browsable. `github` means it lists
 * the repo live at request time, which is the only reliable proof the repo is publicly
 * readable: the API's own `private` flag comes back true even for kungfuflex/alkanes-rs,
 * which is public.
 */
export type SourceOrigin = "db" | "github"

export interface VerifiedSource {
  alkaneId: string
  verdict: SourceVerdict
  matchPct: number
  origin: SourceOrigin
  repo: string
  commit: string
}

export async function fetchVerifiedSource(
  alkaneId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<VerifiedSource | null> {
  if (!isValidAlkaneId(alkaneId)) return null
  const [block, tx] = alkaneId.split(":")
  try {
    const res = await fetchImpl(`${API_BASE}/${block}/${tx}`, {
      signal: AbortSignal.timeout(8_000),
      // Verdicts change rarely, so the profile page pays the 0.4s to 0.85s call once an hour.
      next: { revalidate: 3600 },
    } as RequestInit)
    if (!res.ok) return null

    const json = (await res.json()) as { ok?: unknown; source?: unknown }
    if (json.ok !== true) return null
    const s = json.source
    if (!s || typeof s !== "object") return null
    const src = s as Record<string, unknown>
    if (src.verified !== true) return null

    const verdict = src.verdict
    if (verdict !== "reproducible" && verdict !== "verified") return null

    const origin = src.origin
    if (origin !== "db" && origin !== "github") return null

    const matchPct = src.match_pct
    if (typeof matchPct !== "number" || !Number.isFinite(matchPct)) return null
    if (matchPct < 0 || matchPct > 100) return null

    const repo = src.repo
    if (typeof repo !== "string" || !isValidHttpUrl(repo)) return null

    const commit = src.commit
    if (typeof commit !== "string" || commit.length === 0) return null

    return { alkaneId, verdict, matchPct, origin, repo, commit }
  } catch {
    return null
  }
}

/** "https://github.com/subfrost/subfrost-alkanes" becomes "subfrost/subfrost-alkanes". */
export function repoShortName(repo: string): string {
  const stripped = repo.replace(/^https?:\/\/(www\.)?github\.com\//i, "")
  if (stripped === repo) return repo // not a GitHub URL: leave it legible
  return stripped.replace(/\.git$/i, "").replace(/\/+$/, "")
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
node_modules/.bin/vitest run tests/ecosystem/verified-source.test.ts
```

Expected: PASS, 10 tests.

- [ ] **Step 5: Prove the guards are real, not decorative**

Temporarily delete the line `if (matchPct < 0 || matchPct > 100) return null` and re-run. Expected: the `out-of-range` test **fails**. Restore the line and re-run: PASS. Do the same for `if (src.verified !== true) return null` and confirm the `not verified` test goes red. A guard whose deletion changes nothing is not a guard.

- [ ] **Step 6: Commit**

```bash
git add lib/ecosystem/verified-source.ts tests/ecosystem/verified-source.test.ts
git commit -m "feat(ecosystem): read verified-source attestations from the explorer API"
```

---

### Task 2: The panel

**Files:**
- Create: `components/ecosystem/VerifiedSource.tsx`
- Test: `tests/ecosystem/verified-source-panel.test.tsx`

**Interfaces:**
- Consumes: `VerifiedSource`, `repoShortName` from Task 1.
- Produces: the component `VerifiedSourcePanel` and the copy type `VerifiedSourceCopy` with keys `verifiedSourceTitle`, `verdictReproducible`, `verdictVerified`, `verdictReproducibleNote`, `verdictVerifiedNote`, `matchLabel`, `reproducedFrom`, `commitLabel`, `browseOnExplorer`. Tasks 4 and 5 use both names.

The component is named `VerifiedSourcePanel` so it does not collide with the `VerifiedSource` **type** from Task 1 when both are imported into `EcosystemProfile.tsx`.

**It renders its own `<h2>`.** That is why the `tabs.length === 1` branch in `ProfileBody` needs no change in Task 4: frBTC, ARBUZ and Alkane Pandas have zero tabs today, so Source becomes their only tab and that branch renders `panels[0]` bare. A panel that carries its heading works in both layouts, and the existing `contracts` path stays untouched.

- [ ] **Step 1: Write the failing test**

Create `tests/ecosystem/verified-source-panel.test.tsx`:

```tsx
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { VerifiedSourcePanel, type VerifiedSourceCopy } from "@/components/ecosystem/VerifiedSource"
import type { VerifiedSource } from "@/lib/ecosystem/verified-source"

const copy: VerifiedSourceCopy = {
  verifiedSourceTitle: "Verified source",
  verdictReproducible: "Reproducible",
  verdictVerified: "Verified",
  verdictReproducibleNote: "The rebuilt wasm is byte-exact to the on-chain bytecode.",
  verdictVerifiedNote: "Logic and structure match, with a small host-dependent residual in build metadata.",
  matchLabel: "Byte match",
  reproducedFrom: "Reproduced from",
  commitLabel: "Commit",
  browseOnExplorer: "Browse the source on the explorer",
}

const frbtc: VerifiedSource = {
  alkaneId: "32:0", verdict: "verified", matchPct: 98.69, origin: "db",
  repo: "https://github.com/subfrost/subfrost-alkanes",
  commit: "0748786d1eede608b56ecf1331fe9e1a7c65d463",
}

const goji: VerifiedSource = {
  alkaneId: "2:10663", verdict: "reproducible", matchPct: 100, origin: "github",
  repo: "https://github.com/Misha-btc/Goji", commit: "6fe96cb1234567890",
}

describe("VerifiedSourcePanel", () => {
  it("renders its own heading, the match and the short commit", () => {
    render(<VerifiedSourcePanel v={frbtc} copy={copy} />)
    expect(screen.getByRole("heading", { name: "Verified source" })).toBeInTheDocument()
    expect(screen.getByText(/98\.69%/)).toBeInTheDocument()
    expect(screen.getByText("0748786d")).toBeInTheDocument()
    expect(screen.queryByText(frbtc.commit)).toBeNull() // the full 40-char sha is not printed
  })

  it("renders the repo as plain text when the explorer serves it from its own database", () => {
    const { container } = render(<VerifiedSourcePanel v={frbtc} copy={copy} />)
    expect(screen.getByText("subfrost/subfrost-alkanes")).toBeInTheDocument()
    // subfrost/subfrost-alkanes 404s on GitHub even authenticated: linking it would ship
    // the reader to an error page.
    expect(container.querySelector('a[href="https://github.com/subfrost/subfrost-alkanes"]')).toBeNull()
  })

  it("links the repo to GitHub when the explorer lists it live, which proves it is public", () => {
    render(<VerifiedSourcePanel v={goji} copy={copy} />)
    expect(screen.getByRole("link", { name: /Misha-btc\/Goji/ })).toHaveAttribute(
      "href", "https://github.com/Misha-btc/Goji")
  })

  it("always links out to the explorer's source browser for that alkane", () => {
    render(<VerifiedSourcePanel v={frbtc} copy={copy} />)
    expect(screen.getByRole("link", { name: /Browse the source on the explorer/ })).toHaveAttribute(
      "href", "https://explorer.subfrost.io/alkane/32:0/source")
  })

  it("shows the verdict label and note that belong to each outcome", () => {
    const { rerender } = render(<VerifiedSourcePanel v={frbtc} copy={copy} />)
    expect(screen.getByText("Verified")).toBeInTheDocument()
    expect(screen.getByText(/host-dependent residual/)).toBeInTheDocument()
    expect(screen.queryByText(/byte-exact/)).toBeNull()

    rerender(<VerifiedSourcePanel v={goji} copy={copy} />)
    expect(screen.getByText("Reproducible")).toBeInTheDocument()
    expect(screen.getByText(/byte-exact/)).toBeInTheDocument()
    expect(screen.queryByText(/host-dependent residual/)).toBeNull()
  })

  it("renders a whole-number match without a trailing .00 lie about precision", () => {
    render(<VerifiedSourcePanel v={goji} copy={copy} />)
    expect(screen.getByText(/100%/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
node_modules/.bin/vitest run tests/ecosystem/verified-source-panel.test.tsx
```

Expected: FAIL, `Failed to resolve import "@/components/ecosystem/VerifiedSource"`.

- [ ] **Step 3: Write the implementation**

Create `components/ecosystem/VerifiedSource.tsx`:

```tsx
import { repoShortName, type VerifiedSource } from "@/lib/ecosystem/verified-source"

export interface VerifiedSourceCopy {
  verifiedSourceTitle: string
  verdictReproducible: string
  verdictVerified: string
  verdictReproducibleNote: string
  verdictVerifiedNote: string
  matchLabel: string
  reproducedFrom: string
  commitLabel: string
  browseOnExplorer: string
}

const dtCls = "font-mono text-[10.5px] uppercase tracking-[0.08em] text-[color:var(--ed-muted)]"
const monoCls = "font-mono text-[12.5px] text-[color:var(--ed-ink)]"

/**
 * The explorer's attestation for one alkane. A server component on purpose: static markup,
 * no state, no handlers. Verifying is an interactive feature and stays in the explorer
 * (flex: "On subfrost.io I don't want user interactive features").
 *
 * Owns its <h2> so it renders correctly both as a tab panel and as a lone panel on the
 * profiles that have no other tabs.
 */
export function VerifiedSourcePanel({ v, copy }: { v: VerifiedSource; copy: VerifiedSourceCopy }) {
  const isRepro = v.verdict === "reproducible"
  const verdictLabel = isRepro ? copy.verdictReproducible : copy.verdictVerified
  const verdictNote = isRepro ? copy.verdictReproducibleNote : copy.verdictVerifiedNote
  // Same greens and ambers as STATUS_COLOR in components/ecosystem/visuals.tsx.
  const color = isRepro ? "#178a4c" : "#b7791f"
  const short = repoShortName(v.repo)
  // Number() drops a trailing .00, so a 100% match reads "100%" and 98.69 stays "98.69%".
  const match = `${Number(v.matchPct.toFixed(2))}%`

  return (
    <section>
      <h2 className="text-[20px] font-medium tracking-[-0.012em] text-[color:var(--ed-ink)]">
        {copy.verifiedSourceTitle}
      </h2>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <span
          className="inline-flex items-center gap-1.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em]"
          style={{ color }}
        >
          <i className="h-[7px] w-[7px] rounded-full" style={{ background: color }} />
          {verdictLabel}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.07em] text-[color:var(--ed-muted)]">
          {copy.matchLabel} {match}
        </span>
      </div>

      <p className="mt-3 max-w-[60ch] text-[14.5px] leading-relaxed text-[color:var(--ed-body)]">
        {verdictNote}
      </p>

      <dl className="mt-5 grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
        <dt className={dtCls}>{copy.reproducedFrom}</dt>
        <dd>
          {v.origin === "github" ? (
            <a
              href={v.repo}
              target="_blank" rel="noopener noreferrer"
              className="font-mono text-[12.5px] text-[color:var(--ed-accent)] hover:underline"
            >
              {short} ↗
            </a>
          ) : (
            <span className={monoCls}>{short}</span>
          )}
        </dd>
        <dt className={dtCls}>{copy.commitLabel}</dt>
        <dd><span className={monoCls}>{v.commit.slice(0, 8)}</span></dd>
      </dl>

      <a
        href={`https://explorer.subfrost.io/alkane/${v.alkaneId}/source`}
        target="_blank" rel="noopener noreferrer"
        className="mt-6 inline-flex items-center gap-1 rounded-[7px] border border-[color:var(--ed-hair)] px-3 py-1.5 text-[13px] font-medium text-[color:var(--ed-accent)] transition-colors hover:border-[color:var(--ed-ice)] hover:bg-[color:var(--ed-surface)]"
      >
        {copy.browseOnExplorer} ↗
      </a>
    </section>
  )
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
node_modules/.bin/vitest run tests/ecosystem/verified-source-panel.test.tsx
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Prove the origin guard is real**

Change `v.origin === "github"` to `true` and re-run. Expected: the `serves it from its own database` test **fails**, because frBTC would now render a GitHub anchor. Change it back and re-run: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/ecosystem/VerifiedSource.tsx tests/ecosystem/verified-source-panel.test.tsx
git commit -m "feat(ecosystem): render the verified-source attestation panel"
```

---

### Task 3: Point the contract rows at the explorer

This is flex's literal ask ("update /ecosystem so it points to explorer.subfrost.io") and stands on its own. It affects arbuzino's 6 contract rows, the only profile that renders `ContractsTable` today.

**Files:**
- Modify: `components/ecosystem/EcosystemProfile.tsx:152`
- Test: `tests/ecosystem/profile-page.test.tsx:47-55`

**Interfaces:**
- Consumes: `alkaneExplorerUrl` from `@/lib/ecosystem/constants`, **already imported** at the top of `EcosystemProfile.tsx`.
- Produces: nothing new.

- [ ] **Step 1: Update the test first, so it fails against the current code**

In `tests/ecosystem/profile-page.test.tsx`, replace the whole `renders contracts table with espo.sh links` test with:

```tsx
  it("renders contracts table linking each row to the SUBFROST explorer", () => {
    render(<EcosystemProfile p={profile({})} copy={copy} backHref="/ecosystem" />)
    // Contracts is a tab label rather than a standalone heading: click it to reveal the table.
    fireEvent.click(screen.getByRole("tab", { name: "Contracts" }))
    expect(screen.getByText("Fireball game")).toBeInTheDocument()
    // Asserted on the href, not the link text: the id renders identically whatever the
    // destination, so a label-based assertion here would survive the destination changing.
    expect(screen.getByRole("link", { name: "4:257 ↗" })).toHaveAttribute(
      "href", "https://explorer.subfrost.io/alkane/4:257")
    expect(screen.getByRole("link", { name: "4:777 ↗" })).toHaveAttribute(
      "href", "https://explorer.subfrost.io/alkane/4:777")
  })
```

- [ ] **Step 2: Run it and confirm it fails on the old destination**

```bash
node_modules/.bin/vitest run tests/ecosystem/profile-page.test.tsx
```

Expected: FAIL with `expected "https://espo.sh/alkane/4:257" to equal "https://explorer.subfrost.io/alkane/4:257"`. If it passes, the edit did not land.

- [ ] **Step 3: Repoint the link**

In `components/ecosystem/EcosystemProfile.tsx`, inside `ContractsTable`, change:

```tsx
                  href={`https://espo.sh/alkane/${c.alkaneId}`}
```

to:

```tsx
                  href={alkaneExplorerUrl(c.alkaneId)}
```

- [ ] **Step 4: Run and confirm it passes**

```bash
node_modules/.bin/vitest run tests/ecosystem/profile-page.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Confirm no `espo.sh` is left under `/ecosystem`**

```bash
grep -rn "espo.sh" components/ecosystem lib/ecosystem app/ecosystem
```

Expected: **no output.** `components/MetricsBoxes.tsx` and `components/cms/financials/AccountingManager.tsx` also reference espo.sh, but both are outside `/ecosystem` and outside this scope. Leave them.

- [ ] **Step 6: Commit**

```bash
git add components/ecosystem/EcosystemProfile.tsx tests/ecosystem/profile-page.test.tsx
git commit -m "fix(ecosystem): point contract rows at the SUBFROST explorer, not espo.sh"
```

---

### Task 4: The Source tab

**Files:**
- Modify: `components/ecosystem/EcosystemProfile.tsx`
- Test: `tests/ecosystem/profile-page.test.tsx`

**Interfaces:**
- Consumes: `VerifiedSourcePanel`, `VerifiedSourceCopy` (Task 2); the `VerifiedSource` type (Task 1).
- Produces: `EcosystemProfile` gains an optional prop `verified?: VerifiedSource | null`, and `ProfileCopy` gains `sourceTab: string` and `source: VerifiedSourceCopy`. Task 5 supplies both.

- [ ] **Step 1: Write the failing tests**

Append to `tests/ecosystem/profile-page.test.tsx`. Add these imports at the top of the file:

```tsx
import type { VerifiedSourceCopy } from "@/components/ecosystem/VerifiedSource"
import type { VerifiedSource } from "@/lib/ecosystem/verified-source"
```

Both are **type-only** imports. Do not import the `VerifiedSourcePanel` component here: this file renders it only through `EcosystemProfile`, so a value import would sit unused and fail lint. Then extend the shared `copy` object with the two new keys:

```tsx
const sourceCopy: VerifiedSourceCopy = {
  verifiedSourceTitle: "Verified source",
  verdictReproducible: "Reproducible",
  verdictVerified: "Verified",
  verdictReproducibleNote: "The rebuilt wasm is byte-exact to the on-chain bytecode.",
  verdictVerifiedNote: "Logic and structure match, with a small host-dependent residual in build metadata.",
  matchLabel: "Byte match",
  reproducedFrom: "Reproduced from",
  commitLabel: "Commit",
  browseOnExplorer: "Browse the source on the explorer",
}
```

and add `sourceTab: "Source", source: sourceCopy,` to the existing `copy` literal.

Then append this describe block at the end of the file:

```tsx
describe("EcosystemProfile — Verified source tab", () => {
  const verified: VerifiedSource = {
    alkaneId: "2:25349", verdict: "verified", matchPct: 98.84, origin: "github",
    repo: "https://github.com/Misha-btc/Acai", commit: "6fe96cb1234567890",
  }

  it("adds a Source tab when the alkane has a verified source", () => {
    render(<EcosystemProfile p={profile({})} copy={copy} backHref="/ecosystem" verified={verified} />)
    fireEvent.click(screen.getByRole("tab", { name: "Source" }))
    expect(screen.getByRole("heading", { name: "Verified source" })).toBeInTheDocument()
    expect(screen.getByText(/98\.84%/)).toBeInTheDocument()
  })

  it("omits the Source tab entirely when there is no verified source", () => {
    render(<EcosystemProfile p={profile({})} copy={copy} backHref="/ecosystem" verified={null} />)
    expect(screen.queryByRole("tab", { name: "Source" })).toBeNull()
    expect(screen.queryByText("Verified source")).toBeNull()
  })

  it("omits the Source tab when the prop is not passed at all", () => {
    render(<EcosystemProfile p={profile({})} copy={copy} backHref="/ecosystem" />)
    expect(screen.queryByRole("tab", { name: "Source" })).toBeNull()
  })

  it("renders the panel with its own heading when Source is the only tab", () => {
    // frBTC in production: no profile markdown and no contract rows, so Source is its
    // first and only tab and ProfileBody renders it through the no-tablist branch.
    render(
      <EcosystemProfile
        p={profile({ profile: "", contracts: [] })}
        copy={copy}
        backHref="/ecosystem"
        verified={verified}
      />,
    )
    expect(screen.queryByRole("tablist")).toBeNull()
    expect(screen.getByRole("heading", { name: "Verified source" })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run and confirm it fails**

```bash
node_modules/.bin/vitest run tests/ecosystem/profile-page.test.tsx
```

Expected: FAIL. TypeScript rejects the unknown `verified` prop and the tab is never found.

- [ ] **Step 3: Wire the prop and the tab**

In `components/ecosystem/EcosystemProfile.tsx`:

Add to the imports:

```tsx
import { VerifiedSourcePanel, type VerifiedSourceCopy } from "@/components/ecosystem/VerifiedSource"
import type { VerifiedSource } from "@/lib/ecosystem/verified-source"
```

Add two keys to `ProfileCopy`, after `notesCol: string`:

```tsx
  sourceTab: string
  source: VerifiedSourceCopy
```

Change the `EcosystemProfile` signature to accept and forward the attestation:

```tsx
export function EcosystemProfile({ p, copy, backHref, statHero, priceChart, verified }: {
  p: PublicEcosystemProfile
  copy: ProfileCopy
  backHref: string
  statHero?: ReactNode
  priceChart?: ReactNode
  verified?: VerifiedSource | null
}) {
```

and pass it through at the bottom of that component:

```tsx
      <ProfileBody intro={intro} sections={sections} contracts={p.contracts} copy={copy} verified={verified ?? null} />
```

Then in `ProfileBody`, add the parameter and the tab. The tab is appended **last**, after Contracts:

```tsx
function ProfileBody({ intro, sections, contracts, copy, verified }: {
  intro: string
  sections: ReturnType<typeof splitProfileSections>["sections"]
  contracts: PublicEcosystemProfile["contracts"]
  copy: ProfileCopy
  verified: VerifiedSource | null
}) {
```

and immediately after the existing `if (contracts.length > 0) { ... }` block:

```tsx
  if (verified) {
    tabs.push({ key: "source", label: copy.sourceTab })
    panels.push(<VerifiedSourcePanel v={verified} copy={copy.source} />)
  }
```

**Do not touch the `tabs.length === 1` branch.** `VerifiedSourcePanel` carries its own `<h2>`, so the bare-`panels[0]` path already renders correctly, and leaving that branch alone keeps the existing `contracts` behaviour byte-identical.

- [ ] **Step 4: Run and confirm it passes**

```bash
node_modules/.bin/vitest run tests/ecosystem/profile-page.test.tsx
```

Expected: PASS, every test in the file including the pre-existing ones.

- [ ] **Step 5: Confirm the tab ordering did not disturb the existing tabs**

```bash
node_modules/.bin/vitest run tests/ecosystem/
```

Expected: PASS. In particular `renders tabs from H2 sections plus Overview and Contracts` and `thin profile (≤1 panel) keeps the v1 layout without a tablist` must both still pass: the first proves Source did not displace anything, the second proves a profile with no attestation still renders with no tablist.

- [ ] **Step 6: Commit**

```bash
git add components/ecosystem/EcosystemProfile.tsx tests/ecosystem/profile-page.test.tsx
git commit -m "feat(ecosystem): add the Verified source tab to project profiles"
```

---

### Task 5: Fetch it on the page, in both locales

**Files:**
- Modify: `app/ecosystem/[slug]/page.tsx`

**Interfaces:**
- Consumes: `fetchVerifiedSource` (Task 1), the `verified` prop and the `sourceTab` / `source` copy keys (Task 4).
- Produces: nothing downstream.

- [ ] **Step 1: Add the import**

In `app/ecosystem/[slug]/page.tsx`:

```tsx
import { fetchVerifiedSource } from "@/lib/ecosystem/verified-source"
```

- [ ] **Step 2: Add the EN copy**

Inside `copy.en`, after the `contractsTitle` line, add:

```tsx
    sourceTab: "Source",
    source: {
      verifiedSourceTitle: "Verified source",
      verdictReproducible: "Reproducible",
      verdictVerified: "Verified",
      verdictReproducibleNote: "The explorer rebuilt this contract from source in a pinned sandbox, and the result is byte-exact to the bytecode on chain.",
      verdictVerifiedNote: "Logic and structure match the source exactly. A few bytes of build metadata differ, which is what a foreign build host leaves behind.",
      matchLabel: "Byte match",
      reproducedFrom: "Reproduced from",
      commitLabel: "Commit",
      browseOnExplorer: "Browse the source on the explorer",
    },
```

- [ ] **Step 3: Add the ZH copy**

Inside `copy.zh`, in the same position:

```tsx
    sourceTab: "源码",
    source: {
      verifiedSourceTitle: "已验证源码",
      verdictReproducible: "可复现",
      verdictVerified: "已验证",
      verdictReproducibleNote: "浏览器在固定环境的沙箱中从源码重新构建了该合约，结果与链上字节码逐字节一致。",
      verdictVerifiedNote: "逻辑与结构和源码完全一致，仅有几个字节的构建元数据存在差异，这是不同构建主机留下的痕迹。",
      matchLabel: "字节匹配度",
      reproducedFrom: "复现自",
      commitLabel: "提交",
      browseOnExplorer: "在浏览器中查看源码",
    },
```

Check both blocks for em-dash before moving on: `grep -n "—\|–\|——" app/ecosystem/\[slug\]/page.tsx` must print nothing.

- [ ] **Step 4: Fetch the attestation and pass it down**

`alkaneId` only exists once the profile resolves, so this call cannot join the existing `Promise.all`. Immediately after the `if (!p) notFound()` line, add:

```tsx
  // Decorative like statHero and priceChart: a failed or missing attestation must never take
  // down a profile, so this collapses to null. Cached for an hour inside fetchVerifiedSource.
  const verified = p.alkaneId ? await fetchVerifiedSource(p.alkaneId).catch(() => null) : null
```

and add the prop to the `<EcosystemProfile ... />` call:

```tsx
          verified={verified}
```

- [ ] **Step 5: Typecheck and run the whole ecosystem suite**

```bash
node_modules/.bin/tsc --noEmit
```

Expected: no output.

```bash
node_modules/.bin/vitest run tests/ecosystem/
```

Expected: PASS. The suite was 190 tests before this plan; it should now be around 210.

- [ ] **Step 6: Lint the touched files**

```bash
node_modules/.bin/eslint lib/ecosystem/verified-source.ts components/ecosystem/VerifiedSource.tsx components/ecosystem/EcosystemProfile.tsx "app/ecosystem/[slug]/page.tsx"
```

Expected: no output.

- [ ] **Step 7: Verify against the live API before opening the PR**

The unit tests use a fixture. This confirms the fixture still matches reality:

```bash
curl -s https://explorer.subfrost.io/api/v1/subfrost/source/32/0
```

Expected: `"verified":true`, `"verdict":"verified"`, `"origin":"db"`, `match_pct` near 98.69. If the shape changed, Task 1's parser is what has to change, not the tests.

- [ ] **Step 8: Commit and open the PR**

```bash
git add "app/ecosystem/[slug]/page.tsx"
git commit -m "feat(ecosystem): fetch the verified-source attestation on profile pages, EN and ZH"
git push -u origin feat/ecosystem-verified-source
```

PR title: `feat(ecosystem): Verified source tab, and every alkane link points at the explorer`

PR body must state: no schema change, no migration, no new env var required, and that the diesel and fire `url` rows still need the data edit below.

---

## After the merge

The `newTag` bump is automatic. Flux and Cloud Run pick it up without help.

- [ ] **Data step, in `/admin/ecosystem`, after the rollout.** `diesel` and `fire` still carry `url = https://espo.sh/alkane/...`, which is the "Website" button in the profile header. This is a row edit on an existing column, so the `prisma db push --accept-data-loss` ordering trap does **not** apply here. It cannot ship in the PR: directory data lives in the production database, not in `scripts/data/ecosystem-seed.json`, which is stale.

  Two options, Vitor's call, and Gabe owns directory curation:
  1. Point both at `explorer.subfrost.io/alkane/<id>`, consistent with the WUNSCH fix of 2026-07-22. Note this **duplicates** the alkane id badge that already sits in the header and links to the same URL.
  2. Point them at a real product page (`app.subfrost.io` for FIRE, whichever page fits DIESEL). No duplicate link, and the reader gets somewhere new.

  Option 2 is the better page. Either satisfies flex's ask, which was to remove espo.sh.

- [ ] **Verify in production**, both locales:

```bash
for s in diesel frbtc fire arbuz arbuzino acai goji alkane-pandas wunsch-vault; do
  echo "$s espo=$(curl -s "https://subfrost.io/ecosystem/$s" | grep -o 'espo\.sh' | wc -l) source=$(curl -s "https://subfrost.io/ecosystem/$s" | grep -o 'Verified source' | wc -l)"
done
```

Expected: `espo=0` everywhere, and `source` non-zero for exactly diesel, frbtc, fire, arbuz, acai and goji. `alkane-pandas` and `wunsch-vault` must show `source=0`: they return 404 from the API and must render no tab.

Note `grep -o ... | wc -l` counts occurrences. Plain `grep -c` counts **lines**, and these pages are served as a single line, so `grep -c` reports 1 for any number of hits. That mistake produced two wrong readings while measuring this work.

## Open questions for flex, none blocking

- **ARBUZ (`2:25349`) resolves to `Misha-btc/Acai`**, byte-identical to Acai's own record including `match_pct` to fourteen decimals. Same binary deployed twice, or a resolver collision? The panel says "Reproduced from", which is true either way, so this does not block the PR.
- **`explorer.subfrost.io/alkane/{id}/source` served "Backend temporarily unavailable, the indexer didn't respond" from 12:16 to at least 12:29 UTC on 2026-07-23**, while the source API answered 200 the whole time. That page is the link-out target.
- **`subvh`** does not resolve: no DNS on `subvh.subfrost.io`, 404 on `explorer.subfrost.io/subvh`, no mention across the six `/docs` pages, no repo under `subfrost` or `kungfuflex`.
