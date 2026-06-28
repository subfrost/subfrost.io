import { NextResponse } from "next/server"
import { Storage } from "@google-cloud/storage"

// GET /nightly -> 302 to the CDN download of the LATEST SUBFROST Chrome
// extension build, using the VERSIONED path (e.g. /releases/chrome/v0.1.129/
// subfrost-chrome.zip) rather than the floating /latest/ path so the URL is
// unique per release and never served stale from a cache.
//
// The latest version is discovered by listing the release "directories" in
// the CDN bucket (subfrost-cdn-bucket, in the alkane-assets project — the
// runtime SAs subfrost-io-k8s and the Cloud Run compute SA hold
// roles/storage.objectViewer on it). Result is cached in-process briefly so
// we don't list GCS on every hit. On any failure we fall back to the
// /latest/ path so /nightly always yields a working download.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const CDN_BUCKET = process.env.CDN_BUCKET || "subfrost-cdn-bucket"
const CDN_BASE = "https://cdn.subfrost.io"
const PREFIX = "releases/chrome/"
const FILE = "subfrost-chrome.zip"
const LATEST_FALLBACK = `${CDN_BASE}/${PREFIX}latest/${FILE}`
const CACHE_TTL_MS = 5 * 60_000

let _storage: Storage | null = null
function cdnBucket() {
  if (!_storage) _storage = new Storage()
  return _storage.bucket(CDN_BUCKET)
}

let _cache: { url: string; at: number } | null = null

type SemVer = [number, number, number]
function cmp(a: SemVer, b: SemVer): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
}

/** List the `v<semver>/` release dirs and return the versioned zip URL for the
 *  highest one. Throws if none are found. */
async function latestVersionedUrl(): Promise<string> {
  if (_cache && Date.now() - _cache.at < CACHE_TTL_MS) return _cache.url

  // delimiter "/" => the common prefixes (the "subdirectories") come back on
  // the raw API response as `prefixes`.
  const [, , apiResponse] = await cdnBucket().getFiles({
    prefix: PREFIX,
    delimiter: "/",
    autoPaginate: false,
  })
  const prefixes: string[] = (apiResponse as { prefixes?: string[] })?.prefixes ?? []

  let best: SemVer | null = null
  let bestLabel = ""
  for (const p of prefixes) {
    // e.g. "releases/chrome/v0.1.129/"
    const m = p.match(/\/v(\d+)\.(\d+)\.(\d+)\/$/)
    if (!m) continue
    const v: SemVer = [Number(m[1]), Number(m[2]), Number(m[3])]
    if (!best || cmp(v, best) > 0) {
      best = v
      bestLabel = `v${m[1]}.${m[2]}.${m[3]}`
    }
  }
  if (!bestLabel) throw new Error("no versioned chrome release found")

  const url = `${CDN_BASE}/${PREFIX}${bestLabel}/${FILE}`
  _cache = { url, at: Date.now() }
  return url
}

export async function GET() {
  let target = LATEST_FALLBACK
  try {
    target = await latestVersionedUrl()
  } catch (e) {
    console.error("[nightly] version discovery failed; using /latest/", e)
  }
  const res = NextResponse.redirect(target, 302)
  // Don't let the redirect itself get cached — each hit re-resolves to the
  // current latest version.
  res.headers.set("Cache-Control", "no-store, max-age=0")
  return res
}
