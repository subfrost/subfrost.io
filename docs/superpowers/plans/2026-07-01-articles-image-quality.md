# Articles Image Quality — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve /articles images at top quality (SVG-first for our charts; AVIF/WebP retina for raster) and make the X social card always framed correctly — with zero schema change and no regression to existing images.

**Architecture:** Process on upload (not the Next optimizer): sanitize SVGs, and transcode raster to AVIF+WebP+fallback stored side-by-side in GCS under an `.opt.` name marker. A render-side `pictureSources()` derives the `<picture>` sources from that marker, so only newly-processed images get `<picture>` (old/external URLs stay plain `<img>`). The X card is generated on the fly by a per-article `next/og` route from the cover.

**Tech Stack:** Next.js 16, React 19, TypeScript, `sharp` (raster transcode), `dompurify`+`jsdom` (SVG sanitize), `next/og` (OG image), Vitest, GCS (`@google-cloud/storage`).

## Global Constraints

- **No Prisma schema change** — the init `prisma db push` (no `--accept-data-loss`) breaks boot if the DB diverges.
- **No `next/image` / no Next Image Optimization** — keep `images.unoptimized: true`; all rendering stays `<img>`/`<picture>`.
- **No regression** — images without the `.opt.` marker and external (non-`subfrost-cms`) URLs must render exactly as today (plain `<img>`, now with `loading="lazy" decoding="async"`).
- **Marker string is exactly `.opt.`** placed before the extension, e.g. `covers/foo-ab12cd34.opt.png`.
- **Bucket host** for detection: `storage.googleapis.com/subfrost-cms/` (env `CMS_BUCKET` default `subfrost-cms`).
- **AVIF quality 60, WebP quality 85, max width 1920px, no upscale** (`withoutEnlargement: true`).
- **Verify via** `npx tsc --noEmit` (CI ignores type errors) + `npx vitest run tests/cms/`. Deliver via PR (branch `feat/articles-image-quality`), never push to main.
- Tests: Vitest, `@/` alias = repo root, env happy-dom, `describe/it/expect/vi` (globals on).

---

## File Structure

**Create:**
- `lib/cms/svg-sanitize.ts` — `sanitizeSvg(input): string`.
- `lib/cms/image-process.ts` — `processRaster(contentType, data): Promise<RasterSet|null>`, `optBaseName(idHint, data): string`.
- `lib/cms/image-srcset.ts` — `pictureSources(src): PictureSources|null`.
- `lib/cms/handle-upload.ts` — `handleUpload(kind, contentType, data, idHint): Promise<{url}>` (orchestration).
- `components/articles/SmartPicture.tsx` — server component rendering `<picture>` from a src, falling back to `<img>`.
- `app/articles/[slug]/opengraph-image.tsx` — per-article `next/og` route.
- Tests: `tests/cms/svg-sanitize.test.ts`, `tests/cms/image-process.test.ts`, `tests/cms/image-srcset.test.ts`, `tests/cms/handle-upload.test.ts`, `tests/cms/smart-picture.test.tsx`, `tests/cms/article-markdown-img.test.tsx`, `tests/cms/article-og-meta.test.ts`.

**Modify:**
- `lib/cms/gcs.ts` — allow `image/svg+xml`; add `uploadOptimizedSet()` and `uploadSvg()`.
- `app/api/admin/upload/route.ts` — call `handleUpload`.
- `lib/cms/markdown.tsx` — add custom `img` component using `SmartPicture`.
- `components/articles/CmsCoverImage.tsx`, `components/articles/BlogCardCover.tsx` — use `pictureSources`.
- `app/articles/[slug]/page.tsx` — point `og:image`/`twitter:image` at the OG route.
- `package.json` — add `sharp`, `dompurify`, `jsdom`.

---

## Task 1: SVG sanitization (`lib/cms/svg-sanitize.ts`)

**Files:**
- Create: `lib/cms/svg-sanitize.ts`
- Test: `tests/cms/svg-sanitize.test.ts`
- Modify: `package.json` (add `dompurify`, `jsdom`)

**Interfaces:**
- Produces: `sanitizeSvg(input: Buffer | string): string` — returns sanitized SVG markup. Strips `<script>`, `on*` handlers, `<foreignObject>`, and external/js `href`.

- [ ] **Step 1: Install deps**

Run: `pnpm add dompurify jsdom && pnpm add -D @types/dompurify @types/jsdom`
Expected: added to `package.json`, `pnpm-lock.yaml` updated.

- [ ] **Step 2: Write the failing test**

```ts
// tests/cms/svg-sanitize.test.ts
import { describe, it, expect } from "vitest"
import { sanitizeSvg } from "@/lib/cms/svg-sanitize"

describe("sanitizeSvg", () => {
  it("keeps legit shapes, text and gradients", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="g"/></defs><rect width="10" height="10" fill="url(#g)"/><text x="1" y="2">A</text></svg>`
    const out = sanitizeSvg(svg)
    expect(out).toContain("<svg")
    expect(out).toContain("<rect")
    expect(out).toContain("<text")
    expect(out).toContain("linearGradient")
  })
  it("strips <script>, event handlers and foreignObject", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect onload="alert(2)" width="1" height="1"/><foreignObject><body/></foreignObject></svg>`
    const out = sanitizeSvg(svg)
    expect(out).not.toMatch(/<script/i)
    expect(out).not.toMatch(/onload/i)
    expect(out).not.toMatch(/foreignObject/i)
  })
  it("accepts a Buffer", () => {
    const out = sanitizeSvg(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>`))
    expect(out).toContain("<rect")
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/cms/svg-sanitize.test.ts`
Expected: FAIL — cannot find module `@/lib/cms/svg-sanitize`.

- [ ] **Step 4: Implement**

```ts
// lib/cms/svg-sanitize.ts
import createDOMPurify from "dompurify"
import { JSDOM } from "jsdom"

// SVG can carry script/handlers — sanitize before we host it on our bucket.
// We serve SVG via <img> (no script execution), but sanitizing protects
// download/reuse and defense-in-depth.
const { window } = new JSDOM("")
const DOMPurify = createDOMPurify(window as unknown as Window)

export function sanitizeSvg(input: Buffer | string): string {
  const raw = typeof input === "string" ? input : input.toString("utf8")
  return DOMPurify.sanitize(raw, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ["script", "foreignObject"],
    FORBID_ATTR: ["onload", "onclick", "onmouseover"],
  })
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/cms/svg-sanitize.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/cms/svg-sanitize.ts tests/cms/svg-sanitize.test.ts package.json pnpm-lock.yaml
git commit -m "feat(cms): server-side SVG sanitization"
```

---

## Task 2: Raster processing (`lib/cms/image-process.ts`)

**Files:**
- Create: `lib/cms/image-process.ts`
- Test: `tests/cms/image-process.test.ts`
- Modify: `package.json` (add `sharp`)

**Interfaces:**
- Produces:
  - `type RasterSet = { ext: "png" | "jpg" | "webp"; fallback: Buffer; avif: Buffer; webp: Buffer }`
  - `processRaster(contentType: string, data: Buffer): Promise<RasterSet | null>` — returns `null` for types we don't transcode (gif/svg/unknown). Auto-orients, caps width at 1920 (no upscale), emits AVIF q60 + WebP q85 + a re-encoded fallback in the source raster family.
  - `optBaseName(idHint: string, data: Buffer): string` — `"<safe>-<hash8>"`; `safe` = idHint stripped to `[a-z0-9-]` ≤40 chars, `hash8` = first 8 hex of sha1(data). Shared by all derivatives of one upload.

- [ ] **Step 1: Install dep**

Run: `pnpm add sharp`
Expected: `sharp` in `package.json` dependencies.

- [ ] **Step 2: Write the failing test**

```ts
// tests/cms/image-process.test.ts
import { describe, it, expect } from "vitest"
import sharp from "sharp"
import { processRaster, optBaseName } from "@/lib/cms/image-process"

async function pngOf(w: number, h: number): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: { r: 10, g: 20, b: 40 } } }).png().toBuffer()
}

describe("processRaster", () => {
  it("emits avif+webp+fallback for a png, capping width without upscale", async () => {
    const src = await pngOf(2400, 1000)
    const set = await processRaster("image/png", src)
    expect(set).not.toBeNull()
    expect(set!.ext).toBe("png")
    expect(set!.avif.byteLength).toBeGreaterThan(0)
    expect(set!.webp.byteLength).toBeGreaterThan(0)
    const meta = await sharp(set!.avif).metadata()
    expect(meta.width).toBe(1920) // capped
  })
  it("does not upscale a small image", async () => {
    const src = await pngOf(600, 400)
    const set = await processRaster("image/png", src)
    const meta = await sharp(set!.webp).metadata()
    expect(meta.width).toBe(600)
  })
  it("returns null for gif and svg", async () => {
    expect(await processRaster("image/gif", Buffer.from("x"))).toBeNull()
    expect(await processRaster("image/svg+xml", Buffer.from("x"))).toBeNull()
  })
})

describe("optBaseName", () => {
  it("is stable for the same bytes and sanitizes the hint", async () => {
    const buf = await pngOf(10, 10)
    const a = optBaseName("user-1/My Shot!.png", buf)
    const b = optBaseName("user-1/My Shot!.png", buf)
    expect(a).toBe(b)
    expect(a).toMatch(/^[a-z0-9-]+-[0-9a-f]{8}$/i)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/cms/image-process.test.ts`
Expected: FAIL — cannot find module `@/lib/cms/image-process`.

- [ ] **Step 4: Implement**

```ts
// lib/cms/image-process.ts
import sharp from "sharp"
import { createHash } from "node:crypto"

export const MAX_WIDTH = 1920
export const AVIF_QUALITY = 60
export const WEBP_QUALITY = 85

export type RasterSet = { ext: "png" | "jpg" | "webp"; fallback: Buffer; avif: Buffer; webp: Buffer }

const EXT_BY_TYPE: Record<string, "png" | "jpg" | "webp"> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
}

export function optBaseName(idHint: string, data: Buffer): string {
  const safe = idHint.replace(/[^a-z0-9-]/gi, "").slice(0, 40) || "img"
  const hash = createHash("sha1").update(data).digest("hex").slice(0, 8)
  return `${safe}-${hash}`
}

export async function processRaster(contentType: string, data: Buffer): Promise<RasterSet | null> {
  const ext = EXT_BY_TYPE[contentType]
  if (!ext) return null // gif/svg/unknown are not transcoded here
  const base = sharp(data).rotate().resize({ width: MAX_WIDTH, withoutEnlargement: true })
  const [avif, webp, fallback] = await Promise.all([
    base.clone().avif({ quality: AVIF_QUALITY }).toBuffer(),
    base.clone().webp({ quality: WEBP_QUALITY }).toBuffer(),
    ext === "jpg"
      ? base.clone().jpeg({ quality: 90 }).toBuffer()
      : ext === "webp"
        ? base.clone().webp({ quality: WEBP_QUALITY }).toBuffer()
        : base.clone().png({ compressionLevel: 9 }).toBuffer(),
  ])
  return { ext, fallback, avif, webp }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/cms/image-process.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/cms/image-process.ts tests/cms/image-process.test.ts package.json pnpm-lock.yaml
git commit -m "feat(cms): sharp raster transcode (avif/webp/fallback, capped, no upscale)"
```

---

## Task 3: Derive `<picture>` sources (`lib/cms/image-srcset.ts`)

**Files:**
- Create: `lib/cms/image-srcset.ts`
- Test: `tests/cms/image-srcset.test.ts`

**Interfaces:**
- Produces:
  - `type PictureSources = { avif: string; webp: string; fallback: string }`
  - `pictureSources(src: string): PictureSources | null` — for a `subfrost-cms` URL matching `…<name>.opt.<png|jpg|jpeg|webp>`, returns the three sibling URLs. Returns `null` for SVG, non-`.opt.`, and non-bucket/external URLs.

- [ ] **Step 1: Write the failing test**

```ts
// tests/cms/image-srcset.test.ts
import { describe, it, expect } from "vitest"
import { pictureSources } from "@/lib/cms/image-srcset"

const B = "https://storage.googleapis.com/subfrost-cms"

describe("pictureSources", () => {
  it("derives avif/webp/fallback for an .opt. bucket url", () => {
    const s = pictureSources(`${B}/inline/foo-ab12cd34.opt.png`)
    expect(s).toEqual({
      avif: `${B}/inline/foo-ab12cd34.opt.avif`,
      webp: `${B}/inline/foo-ab12cd34.opt.webp`,
      fallback: `${B}/inline/foo-ab12cd34.opt.png`,
    })
  })
  it("returns null for non-.opt. urls", () => {
    expect(pictureSources(`${B}/inline/foo-16394.png`)).toBeNull()
  })
  it("returns null for svg and external urls", () => {
    expect(pictureSources(`${B}/inline/chart.svg`)).toBeNull()
    expect(pictureSources(`https://imgur.com/x.opt.png`)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cms/image-srcset.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement**

```ts
// lib/cms/image-srcset.ts
const BUCKET = process.env.CMS_BUCKET || "subfrost-cms"
const HOST = `https://storage.googleapis.com/${BUCKET}/`
const OPT_RE = /\.opt\.(png|jpe?g|webp)$/i

export type PictureSources = { avif: string; webp: string; fallback: string }

export function pictureSources(src: string): PictureSources | null {
  if (!src.startsWith(HOST)) return null
  if (!OPT_RE.test(src)) return null
  const stem = src.replace(OPT_RE, ".opt")
  return { avif: `${stem}.avif`, webp: `${stem}.webp`, fallback: src }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cms/image-srcset.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/cms/image-srcset.ts tests/cms/image-srcset.test.ts
git commit -m "feat(cms): derive picture sources from .opt. marker"
```

---

## Task 4: GCS — allow SVG + write derivative set

**Files:**
- Modify: `lib/cms/gcs.ts` (ALLOWED/EXT around lines 15-22; add two functions)
- Test: `tests/cms/gcs.test.ts` (create)

**Interfaces:**
- Consumes: `RasterSet` (Task 2).
- Produces:
  - `uploadOptimizedSet(prefix: "avatars"|"covers"|"inline", base: string, set: RasterSet): Promise<{ url: string }>` — saves `<prefix>/<base>.opt.<ext>`, `.opt.avif`, `.opt.webp`; returns the fallback URL.
  - `uploadSvg(prefix, idHint, svg: string): Promise<{ url: string }>` — saves `<prefix>/<safe>-<len>.svg`.
  - `objectPath(prefix, base, suffix): string` — pure helper `"<prefix>/<base>.<suffix>"` (exported for tests).

- [ ] **Step 1: Write the failing test (pure naming only — no GCS)**

```ts
// tests/cms/gcs.test.ts
import { describe, it, expect } from "vitest"
import { objectPath } from "@/lib/cms/gcs"

describe("objectPath", () => {
  it("builds prefixed .opt names", () => {
    expect(objectPath("inline", "foo-ab12cd34", "opt.avif")).toBe("inline/foo-ab12cd34.opt.avif")
    expect(objectPath("covers", "c-1", "opt.png")).toBe("covers/c-1.opt.png")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cms/gcs.test.ts`
Expected: FAIL — `objectPath` is not exported.

- [ ] **Step 3: Implement in `lib/cms/gcs.ts`**

Add `image/svg+xml` to `ALLOWED` and `EXT` (`"image/svg+xml": "svg"`). Then add:

```ts
// --- Optimized image sets (avif/webp/fallback) + SVG -----------------------
import type { RasterSet } from "@/lib/cms/image-process"

const PUBLIC = (name: string) => `https://storage.googleapis.com/${BUCKET}/${name}`

export function objectPath(prefix: string, base: string, suffix: string): string {
  return `${prefix}/${base}.${suffix}`
}

async function save(name: string, data: Buffer, contentType: string): Promise<void> {
  await storage().bucket(BUCKET).file(name).save(data, {
    contentType,
    resumable: false,
    metadata: { cacheControl: "public, max-age=31536000" },
  })
}

const RASTER_CT: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" }

export async function uploadOptimizedSet(
  prefix: "avatars" | "covers" | "inline",
  base: string,
  set: RasterSet,
): Promise<UploadResult> {
  await Promise.all([
    save(objectPath(prefix, base, `opt.${set.ext}`), set.fallback, RASTER_CT[set.ext]),
    save(objectPath(prefix, base, "opt.avif"), set.avif, "image/avif"),
    save(objectPath(prefix, base, "opt.webp"), set.webp, "image/webp"),
  ])
  return { url: PUBLIC(objectPath(prefix, base, `opt.${set.ext}`)) }
}

export async function uploadSvg(
  prefix: "avatars" | "covers" | "inline",
  idHint: string,
  svg: string,
): Promise<UploadResult> {
  const data = Buffer.from(svg, "utf8")
  const safe = idHint.replace(/[^a-z0-9-]/gi, "").slice(0, 40) || "img"
  const name = objectPath(prefix, `${safe}-${data.byteLength}`, "svg")
  await save(name, data, "image/svg+xml")
  return { url: PUBLIC(name) }
}
```

(If `PUBLIC`/`storage`/`BUCKET`/`UploadResult` already exist, reuse them; do not duplicate.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cms/gcs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cms/gcs.ts tests/cms/gcs.test.ts
git commit -m "feat(cms): gcs allow svg + write optimized derivative set"
```

---

## Task 5: Upload orchestration (`lib/cms/handle-upload.ts` + route)

**Files:**
- Create: `lib/cms/handle-upload.ts`
- Test: `tests/cms/handle-upload.test.ts`
- Modify: `app/api/admin/upload/route.ts:22-25`

**Interfaces:**
- Consumes: `sanitizeSvg` (T1), `processRaster`/`optBaseName` (T2), `uploadOptimizedSet`/`uploadSvg`/`uploadImage` (T4/existing).
- Produces: `handleUpload(kind, contentType, data, idHint): Promise<{ url: string }>` where `kind: "avatar"|"cover"|"inline"` maps to prefix `avatars|covers|inline`. Flow: SVG → sanitize → `uploadSvg`; raster transcodable → `processRaster` → `uploadOptimizedSet`; otherwise (gif) → `uploadImage` (raw, existing behavior).

- [ ] **Step 1: Write the failing test**

```ts
// tests/cms/handle-upload.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/cms/gcs", () => ({
  uploadOptimizedSet: vi.fn(async () => ({ url: "https://x/covers/base.opt.png" })),
  uploadSvg: vi.fn(async () => ({ url: "https://x/inline/c-10.svg" })),
  uploadImage: vi.fn(async () => ({ url: "https://x/inline/g-3.gif" })),
}))
vi.mock("@/lib/cms/svg-sanitize", () => ({ sanitizeSvg: vi.fn(() => "<svg/>") }))
vi.mock("@/lib/cms/image-process", () => ({
  optBaseName: vi.fn(() => "base"),
  processRaster: vi.fn(async (ct: string) => (ct === "image/gif" ? null : { ext: "png", fallback: Buffer.from(""), avif: Buffer.from(""), webp: Buffer.from("") })),
}))

import { handleUpload } from "@/lib/cms/handle-upload"
import { uploadOptimizedSet, uploadSvg, uploadImage } from "@/lib/cms/gcs"
import { sanitizeSvg } from "@/lib/cms/svg-sanitize"

beforeEach(() => vi.clearAllMocks())

describe("handleUpload", () => {
  it("sanitizes + stores svg", async () => {
    const r = await handleUpload("inline", "image/svg+xml", Buffer.from("<svg><script/></svg>"), "c")
    expect(sanitizeSvg).toHaveBeenCalled()
    expect(uploadSvg).toHaveBeenCalledWith("inline", "c", "<svg/>")
    expect(r.url).toContain(".svg")
  })
  it("transcodes + stores an optimized set for png", async () => {
    const r = await handleUpload("cover", "image/png", Buffer.from("x"), "c")
    expect(uploadOptimizedSet).toHaveBeenCalled()
    expect(r.url).toBe("https://x/covers/base.opt.png")
  })
  it("falls back to raw upload for gif", async () => {
    await handleUpload("inline", "image/gif", Buffer.from("x"), "c")
    expect(uploadImage).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cms/handle-upload.test.ts`
Expected: FAIL — cannot find module `@/lib/cms/handle-upload`.

- [ ] **Step 3: Implement**

```ts
// lib/cms/handle-upload.ts
import { sanitizeSvg } from "@/lib/cms/svg-sanitize"
import { processRaster, optBaseName } from "@/lib/cms/image-process"
import { uploadOptimizedSet, uploadSvg, uploadImage } from "@/lib/cms/gcs"

type Kind = "avatar" | "cover" | "inline"
const PREFIX: Record<Kind, "avatars" | "covers" | "inline"> = {
  avatar: "avatars", cover: "covers", inline: "inline",
}

export async function handleUpload(
  kind: Kind, contentType: string, data: Buffer, idHint: string,
): Promise<{ url: string }> {
  const prefix = PREFIX[kind]
  if (contentType === "image/svg+xml") {
    return uploadSvg(prefix, idHint, sanitizeSvg(data))
  }
  const set = await processRaster(contentType, data)
  if (set) return uploadOptimizedSet(prefix, optBaseName(idHint, data), set)
  return uploadImage(prefix, contentType, data, idHint) // gif etc. — raw
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cms/handle-upload.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire the route** — replace `app/api/admin/upload/route.ts:22-25` body

```ts
  try {
    const data = Buffer.from(await file.arrayBuffer())
    const kind3 = (kind === "avatar" ? "avatar" : kind === "cover" ? "cover" : "inline") as "avatar" | "cover" | "inline"
    const { url } = await handleUpload(kind3, file.type, data, idHint)
    return NextResponse.json({ url })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed" }, { status: 400 })
  }
```

Replace the top import `import { uploadImage } from "@/lib/cms/gcs"` with `import { handleUpload } from "@/lib/cms/handle-upload"`.

- [ ] **Step 6: Run type + cms tests**

Run: `npx tsc --noEmit && npx vitest run tests/cms/`
Expected: no type errors; cms tests green.

- [ ] **Step 7: Commit**

```bash
git add lib/cms/handle-upload.ts tests/cms/handle-upload.test.ts app/api/admin/upload/route.ts
git commit -m "feat(cms): route uploads through sanitize/transcode pipeline"
```

---

## Task 6: `<picture>` render (`SmartPicture` + markdown img)

**Files:**
- Create: `components/articles/SmartPicture.tsx`
- Test: `tests/cms/smart-picture.test.tsx`, `tests/cms/article-markdown-img.test.tsx`
- Modify: `lib/cms/markdown.tsx` (add `img` to `components`)

**Interfaces:**
- Consumes: `pictureSources` (T3).
- Produces: `<SmartPicture src alt className loading fetchPriority />` — renders `<picture>` with AVIF→WebP→`<img>` when `pictureSources(src)` is non-null, else a plain `<img>`. Always sets `loading` (default `"lazy"`) and `decoding="async"`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/cms/smart-picture.test.tsx
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { SmartPicture } from "@/components/articles/SmartPicture"

const B = "https://storage.googleapis.com/subfrost-cms"

describe("SmartPicture", () => {
  it("emits <picture> with avif+webp for an .opt. url", () => {
    const { container } = render(<SmartPicture src={`${B}/inline/f-ab12cd34.opt.png`} alt="" />)
    const sources = container.querySelectorAll("source")
    expect(sources[0].getAttribute("type")).toBe("image/avif")
    expect(sources[0].getAttribute("srcset")).toContain(".opt.avif")
    expect(sources[1].getAttribute("type")).toBe("image/webp")
    expect(container.querySelector("img")?.getAttribute("loading")).toBe("lazy")
  })
  it("emits a plain <img> for a non-.opt. url", () => {
    const { container } = render(<SmartPicture src={`${B}/inline/old-16394.png`} alt="" />)
    expect(container.querySelector("picture")).toBeNull()
    expect(container.querySelector("img")?.getAttribute("src")).toContain("old-16394.png")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cms/smart-picture.test.tsx`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement**

```tsx
// components/articles/SmartPicture.tsx
import { pictureSources } from "@/lib/cms/image-srcset"

export function SmartPicture({
  src, alt = "", className, loading = "lazy", fetchPriority = "auto",
}: {
  src: string; alt?: string; className?: string
  loading?: "lazy" | "eager"; fetchPriority?: "auto" | "high" | "low"
}) {
  const p = pictureSources(src)
  if (!p) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} className={className} loading={loading} decoding="async" fetchPriority={fetchPriority} />
  }
  return (
    <picture>
      <source srcSet={p.avif} type="image/avif" />
      <source srcSet={p.webp} type="image/webp" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={p.fallback} alt={alt} className={className} loading={loading} decoding="async" fetchPriority={fetchPriority} />
    </picture>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cms/smart-picture.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the markdown img test**

```tsx
// tests/cms/article-markdown-img.test.tsx
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { Markdown } from "@/lib/cms/markdown"

const B = "https://storage.googleapis.com/subfrost-cms"

describe("Markdown inline images", () => {
  it("renders body images through SmartPicture (<picture> for .opt.)", () => {
    const { container } = render(<Markdown>{`![c](${B}/inline/f-ab12cd34.opt.png)`}</Markdown>)
    expect(container.querySelector("picture source[type='image/avif']")).not.toBeNull()
  })
  it("keeps a plain <img> with lazy loading for external images", () => {
    const { container } = render(<Markdown>{`![c](https://imgur.com/x.png)`}</Markdown>)
    expect(container.querySelector("picture")).toBeNull()
    expect(container.querySelector("img")?.getAttribute("loading")).toBe("lazy")
  })
})
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run tests/cms/article-markdown-img.test.tsx`
Expected: FAIL — body still renders a bare `<img>`, no `<picture>`.

- [ ] **Step 7: Add `img` to `lib/cms/markdown.tsx` `components`**

Inside the `components={{ ... }}` object (next to `a`):

```tsx
          img: ({ src, alt }) => (
            <SmartPicture src={typeof src === "string" ? src : ""} alt={typeof alt === "string" ? alt : ""} />
          ),
```

Add at top: `import { SmartPicture } from "@/components/articles/SmartPicture"`.

- [ ] **Step 8: Run to verify it passes**

Run: `npx vitest run tests/cms/article-markdown-img.test.tsx tests/cms/smart-picture.test.tsx`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add components/articles/SmartPicture.tsx lib/cms/markdown.tsx tests/cms/smart-picture.test.tsx tests/cms/article-markdown-img.test.tsx
git commit -m "feat(articles): render body/inline images via <picture>"
```

---

## Task 7: Cover components use `<picture>`

**Files:**
- Modify: `components/articles/CmsCoverImage.tsx`, `components/articles/BlogCardCover.tsx`
- Test: `tests/cms/cover-picture.test.tsx` (create)

**Interfaces:**
- Consumes: `pictureSources` (T3). These are `"use client"` components with `useState` for the error fallback — keep the fallback behavior; only upgrade the success path to `<picture>` when `pictureSources(src)` is non-null.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/cms/cover-picture.test.tsx
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { CmsCoverImage } from "@/components/articles/CmsCoverImage"

const B = "https://storage.googleapis.com/subfrost-cms"

describe("CmsCoverImage", () => {
  it("uses <picture> with avif for an .opt. cover", () => {
    const { container } = render(<CmsCoverImage src={`${B}/covers/c-ab12cd34.opt.png`} className="x" fallbackVariant="s" />)
    expect(container.querySelector("picture source[type='image/avif']")).not.toBeNull()
  })
  it("keeps a plain <img> for a non-.opt. cover", () => {
    const { container } = render(<CmsCoverImage src={`${B}/covers/old-16394.png`} className="x" fallbackVariant="s" />)
    expect(container.querySelector("picture")).toBeNull()
    expect(container.querySelector("img.ed-cms-cover")).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/cms/cover-picture.test.tsx`
Expected: FAIL — no `<picture>` yet.

- [ ] **Step 3: Implement in `CmsCoverImage.tsx`** — in the success `return` (after the `!src || failed` guard), branch on `pictureSources`:

```tsx
  const p = pictureSources(src)
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={p ? p.fallback : src}
      alt=""
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : "auto"}
      onError={() => setFailed(true)}
      className={`${className} ed-cms-cover`}
    />
  )
  if (!p) return img
  return (
    <picture>
      <source srcSet={p.avif} type="image/avif" />
      <source srcSet={p.webp} type="image/webp" />
      {img}
    </picture>
  )
```

Add `import { pictureSources } from "@/lib/cms/image-srcset"`.

- [ ] **Step 4: Apply the same pattern to `BlogCardCover.tsx`** (wrap its `<img>` in `<picture>` when `pictureSources(coverImage)` is non-null; keep the `onError` fallback and `object-cover` classes on the `<img>`).

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run tests/cms/cover-picture.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/articles/CmsCoverImage.tsx components/articles/BlogCardCover.tsx tests/cms/cover-picture.test.tsx
git commit -m "feat(articles): serve covers via <picture> when optimized"
```

---

## Task 8: Automatic OG card (`opengraph-image` route + metadata)

**Files:**
- Create: `app/articles/[slug]/opengraph-image.tsx`
- Modify: `app/articles/[slug]/page.tsx:44-49,74,81` (point OG/twitter image at the route)
- Test: `tests/cms/article-og-meta.test.ts` (create)

**Interfaces:**
- Produces: a per-article OG route composing the cover into a 1200×630 dark canvas via `next/og` `ImageResponse` (cover `object-fit: contain` — full sides, thin top/bottom bands). Falls back to brand layout when the article has no cover.
- Metadata: `og:image`/`twitter:image` = `absoluteUrlForHost("/articles/<slug>/opengraph-image", host, proto)`.

- [ ] **Step 1: Create the route** (mirror `app/articles/opengraph-image.tsx` structure)

```tsx
// app/articles/[slug]/opengraph-image.tsx
import { ImageResponse } from "next/og"
import { getPublishedArticle } from "@/lib/cms/articles"

export const alt = "SUBFROST Article"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const a = await getPublishedArticle(slug, "en", { previewFallback: true }).catch(() => null)
  const cover = a?.coverImage
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#05070d" }}>
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" width={1200} height={630} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        ) : (
          <div style={{ display: "flex", color: "#eaf2ff", fontSize: 64, fontWeight: 600 }}>SUBFROST</div>
        )}
      </div>
    ),
    { ...size },
  )
}
```

- [ ] **Step 2: Point metadata at the route** in `app/articles/[slug]/page.tsx`

Replace the `image`/`imageMeta` computation (lines ~44-49) so both `openGraph.images` and `twitter.images` use:

```tsx
  const image = absoluteUrlForHost(`/articles/${slug}/opengraph-image`, host, proto)
  const imageMeta = { url: image, width: 1200, height: 630, alt: a.title, type: "image/png" }
```

and ensure `twitter.images` uses `[{ url: image, alt: a.title }]` (line ~81). Leave `articleJsonLd.image` using `a.coverImage` (structured data still points at the real cover).

- [ ] **Step 3: Write the metadata test**

```ts
// tests/cms/article-og-meta.test.ts
import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/cms/articles", () => ({
  getPublishedArticle: vi.fn(async () => ({
    slug: "why-x", title: "Why X", excerpt: "e", coverImage: "https://x/c.png",
    author: { id: "a", name: "A" }, coAuthors: [], tags: [], availableLocales: ["en"],
    publishedAt: null, updatedAt: null,
  })),
}))
vi.mock("next/headers", () => ({
  headers: async () => new Map([["host", "subfrost.io"]]),
  cookies: async () => ({ get: () => undefined }),
}))

import { generateMetadata } from "@/app/articles/[slug]/page"

describe("article OG metadata", () => {
  it("points og/twitter image at the per-article opengraph-image route", async () => {
    const meta: any = await generateMetadata({ params: Promise.resolve({ slug: "why-x" }), searchParams: Promise.resolve({}) })
    expect(meta.openGraph.images[0].url).toContain("/articles/why-x/opengraph-image")
    expect(meta.twitter.images[0].url).toContain("/articles/why-x/opengraph-image")
  })
})
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/cms/article-og-meta.test.ts`
Expected: PASS. (If `headers()` mock shape mismatches, align it with how `page.tsx` reads `x-forwarded-host`/`host` — use a real `Headers` object if needed.)

- [ ] **Step 5: Commit**

```bash
git add app/articles/[slug]/opengraph-image.tsx app/articles/[slug]/page.tsx tests/cms/article-og-meta.test.ts
git commit -m "feat(articles): auto-generate X/OG card from cover (1200x630)"
```

---

## Task 9: Full verification, build check, PR

**Files:** none (verification + delivery).

- [ ] **Step 1: Full type + test sweep**

Run: `npx tsc --noEmit && npx vitest run tests/cms/`
Expected: no type errors; all cms tests green.

- [ ] **Step 2: Verify `sharp` builds in the standalone image** (the #1 deploy risk)

Run: `npx next build`
Expected: build succeeds; no "sharp not found"/native-module error. If sharp needs it, add `sharp` to `serverExternalPackages` in `next.config.mjs` (alongside `@alkanes/ts-sdk`) and re-run.

- [ ] **Step 3: Manual smoke (optional, via preview or `next start`)**

Upload a PNG chart and an SVG chart in `/admin`; confirm the served body image is `<picture>` with AVIF in DevTools, SVG renders crisp, and the article page cover is unchanged. Confirm `/articles/<slug>/opengraph-image` returns a 1200×630 PNG with the cover fully visible.

- [ ] **Step 4: Push branch and open PR**

```bash
git push "https://x-access-token:$(gh auth token)@github.com/subfrost/subfrost.io.git" feat/articles-image-quality
gh pr create --title "Articles image quality: SVG-first + AVIF/WebP + auto OG card" --body "Implements docs/superpowers/specs/2026-07-01-articles-image-quality-design.md. No schema change."
```

- [ ] **Step 5: Deploy note (post-merge, human-owned)**

After merge, deploy via GKE/Flux: bump `newTag` full-SHA (quoted) in `k8s/kustomization.yaml`, reconcile source→kustomization via `.ioenv-extracted/kubectl-io.sh`. Then optionally revert the `why-bip110-doesnt-stop-alkanes` cover to the original full-bleed (`covers/cmqlujevl0000tanjvueemeg3-image3png-2512225.png`) since the OG is now generated; re-scrape the X card with `?v=N`.

---

## Self-Review

- **Spec coverage:** R1 SVG → T1+T4+T5; R2 raster/AVIF/WebP/retina → T2+T4+T5+T6+T7; R3 auto OG → T8; R4 no-regression → T3 (`.opt.` marker) + T6/T7 fallback paths; R5 no schema → nothing touches `schema.prisma`; R6 PR/tsc/vitest → T9. ✅
- **Placeholders:** none — every code step has real code. Task 7 Step 4 (BlogCardCover) describes the pattern already shown fully in Step 3 for CmsCoverImage; the transform is identical (wrap `<img>` in `<picture>` when `pictureSources` non-null).
- **Type consistency:** `RasterSet` (T2) consumed by `uploadOptimizedSet` (T4) and `handleUpload` (T5); `pictureSources`/`PictureSources` (T3) consumed by `SmartPicture` (T6) and covers (T7); `optBaseName` (T2) used in T5. Names consistent throughout.
