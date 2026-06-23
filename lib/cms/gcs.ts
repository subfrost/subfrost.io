import { Storage } from "@google-cloud/storage"

// Uploads (avatars, cover images) go to a public GCS bucket. On Cloud Run the
// default service account is used via ADC; locally, GOOGLE_APPLICATION_CREDENTIALS
// or `gcloud auth application-default login` provides creds.

const BUCKET = process.env.CMS_BUCKET || "subfrost-cms"

let _storage: Storage | null = null
function storage() {
  if (!_storage) _storage = new Storage()
  return _storage
}

const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"])
const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
}

export interface UploadResult {
  url: string
}

/** Uploads an image buffer under `prefix/` and returns its public URL. */
export async function uploadImage(
  prefix: "avatars" | "covers" | "inline",
  contentType: string,
  data: Buffer,
  idHint: string,
): Promise<UploadResult> {
  if (!ALLOWED.has(contentType)) {
    throw new Error(`Unsupported image type: ${contentType}`)
  }
  if (data.byteLength > 8 * 1024 * 1024) {
    throw new Error("Image exceeds 8MB limit")
  }
  const ext = EXT[contentType]
  // idHint keeps a stable-ish path; suffix avoids cache collisions on re-upload.
  const safe = idHint.replace(/[^a-z0-9-]/gi, "").slice(0, 40) || "img"
  const name = `${prefix}/${safe}-${data.byteLength}.${ext}`
  const file = storage().bucket(BUCKET).file(name)
  await file.save(data, {
    contentType,
    resumable: false,
    metadata: { cacheControl: "public, max-age=31536000" },
  })
  return { url: `https://storage.googleapis.com/${BUCKET}/${name}` }
}

/** Uploads an invoice PDF buffer under `invoices/` and returns its public URL.
 *  Parallel to uploadImage: validation runs first, so bad input throws before
 *  any GCS call. */
export async function uploadPdf(
  contentType: string,
  data: Buffer,
  idHint: string,
): Promise<UploadResult> {
  if (contentType !== "application/pdf") {
    throw new Error(`Unsupported file type: ${contentType}`)
  }
  if (data.byteLength > 10 * 1024 * 1024) {
    throw new Error("PDF exceeds 10MB limit")
  }
  const safe = idHint.replace(/[^a-z0-9-]/gi, "").slice(0, 40) || "invoice"
  const name = `invoices/${safe}-${data.byteLength}.pdf`
  const file = storage().bucket(BUCKET).file(name)
  await file.save(data, {
    contentType,
    resumable: false,
    metadata: { cacheControl: "public, max-age=31536000" },
  })
  return { url: `https://storage.googleapis.com/${BUCKET}/${name}` }
}

// --- Private document objects (e-sign envelope PDFs) -----------------------
// Signed legal contracts carry PII + signatures, so unlike invoice/avatar
// uploads these are NOT given a public URL. The object name is stored in the
// DB and the bytes are streamed back only through a privilege-gated route
// (app/api/admin/documents/[id]/attachment). Max 25MB.

const MAX_DOC_BYTES = 25 * 1024 * 1024

/** Stores a private PDF under `documents/` at the given object name (no ACL
 *  change → inherits the bucket's default, never returned as a public URL). */
export async function uploadDocumentPdf(objectName: string, data: Buffer): Promise<void> {
  if (data.byteLength > MAX_DOC_BYTES) {
    throw new Error("Document PDF exceeds 25MB limit")
  }
  const file = storage().bucket(BUCKET).file(objectName)
  await file.save(data, {
    contentType: "application/pdf",
    resumable: false,
    metadata: { cacheControl: "private, max-age=0, no-store" },
  })
}

/** Downloads a private object's bytes. Throws if it doesn't exist. */
export async function downloadObject(objectName: string): Promise<Buffer> {
  const [buf] = await storage().bucket(BUCKET).file(objectName).download()
  return buf
}

export async function objectExists(objectName: string): Promise<boolean> {
  const [exists] = await storage().bucket(BUCKET).file(objectName).exists()
  return exists
}
