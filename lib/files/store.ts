import { Storage, type GetSignedUrlConfig } from "@google-cloud/storage"

// GCS backing for the "Documents" file manager. Private bucket subfrost-docs
// (public-access-prevention enforced). Objects are keyed by file id so rename /
// move are metadata-only (the object never has to be rewritten). Bytes reach
// the browser/CLI via short-lived V4 signed URLs (later: cdn.subfrost.io/secure).
//
// Signing under GKE workload identity uses the IAM signBlob API (the runtime SA
// holds roles/iam.serviceAccountTokenCreator on itself) — no key file needed.

const BUCKET = process.env.DOCS_BUCKET || "subfrost-docs"

let _storage: Storage | null = null
function gcsBucket() {
  if (!_storage) _storage = new Storage()
  return _storage.bucket(BUCKET)
}

/** Stable object key for a file id. */
export function objectKey(fileId: string): string {
  return `files/${fileId}`
}

/** Direct server-side upload of a buffer (used by the CLI / small uploads). */
export async function uploadObject(key: string, contentType: string, data: Buffer): Promise<void> {
  await gcsBucket().file(key).save(data, { contentType, resumable: false })
}

/** V4 signed PUT URL for direct browser/CLI upload of any size/type. The client
 *  must PUT with the same `Content-Type`. */
export async function signedUploadUrl(
  key: string,
  contentType: string,
  ttlMs = 15 * 60_000,
): Promise<string> {
  const cfg: GetSignedUrlConfig = {
    version: "v4",
    action: "write",
    expires: Date.now() + ttlMs,
    contentType,
  }
  const [url] = await gcsBucket().file(key).getSignedUrl(cfg)
  return url
}

/** V4 signed GET URL (short-lived), optionally forcing a download filename. */
export async function signedDownloadUrl(
  key: string,
  filename?: string,
  ttlMs = 10 * 60_000,
): Promise<string> {
  const cfg: GetSignedUrlConfig = {
    version: "v4",
    action: "read",
    expires: Date.now() + ttlMs,
  }
  if (filename) {
    cfg.responseDisposition = `attachment; filename="${filename.replace(/["\\]/g, "")}"`
  }
  const [url] = await gcsBucket().file(key).getSignedUrl(cfg)
  return url
}

export async function deleteObject(key: string): Promise<void> {
  await gcsBucket().file(key).delete({ ignoreNotFound: true })
}

/** Download an object's raw bytes from the docs bucket. Used server-side (e.g.
 *  the markdown→PDF route) to read a file's contents without minting a signed
 *  URL and round-tripping through the browser. Throws if the object is missing. */
export async function downloadObject(key: string): Promise<Buffer> {
  const [buf] = await gcsBucket().file(key).download()
  return buf
}

/** Object byte size from GCS metadata, or null if missing. */
export async function objectSize(key: string): Promise<number | null> {
  try {
    const [md] = await gcsBucket().file(key).getMetadata()
    return md.size != null ? Number(md.size) : null
  } catch {
    return null
  }
}
