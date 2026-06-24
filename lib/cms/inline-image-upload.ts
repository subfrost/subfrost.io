/** Upload a single image File to the admin upload endpoint as an inline body
 *  image. Returns the public URL, or throws with the server's error message. */
export async function uploadInlineImage(file: File, fetchImpl: typeof fetch = fetch): Promise<string> {
  const form = new FormData()
  form.append("file", file)
  form.append("kind", "inline")
  const res = await fetchImpl("/api/admin/upload", { method: "POST", body: form })
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
  if (!res.ok) throw new Error(data.error || "Upload failed")
  if (!data.url) throw new Error("Upload returned no URL")
  return data.url
}
