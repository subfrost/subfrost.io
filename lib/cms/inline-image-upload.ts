/** Upload a single image File to the admin upload endpoint (inline body image
 *  by default; pass a kind for other prefixes, e.g. ecosystem logos). Returns
 *  the public URL, or throws with the server's error message. */
export async function uploadInlineImage(
  file: File,
  fetchImpl: typeof fetch = fetch,
  kind: "inline" | "ecosystem" | "avatar" | "cover" = "inline",
): Promise<string> {
  const form = new FormData()
  form.append("file", file)
  form.append("kind", kind)
  const res = await fetchImpl("/api/admin/upload", { method: "POST", body: form })
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
  if (!res.ok) throw new Error(data.error || "Upload failed")
  if (!data.url) throw new Error("Upload returned no URL")
  return data.url
}
