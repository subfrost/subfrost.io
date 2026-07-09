// Share helpers for the "post to socials" buttons (articles + /metrics cards).
// Pure and client-safe — no server imports — so it can run in client components
// and be unit-tested directly.

/** SUBFROST's X handle, tagged in share text so posts credit the account. */
export const X_HANDLE = "subfrost_news"

/** X (Twitter) web-intent compose URL: opens the composer pre-filled with `text`
 *  and `url`. X can't attach an image via intent, so image cards pair this with a
 *  clipboard copy (see ShareMenu); articles rely on the URL unfurling their OG cover. */
export function tweetIntentUrl(text: string, url: string): string {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`
}

/** Copy the PNG at `url` into the clipboard as an image, so it can be pasted
 *  straight into an X/social composer (X won't attach images via web-intent).
 *  Returns false when the browser can't — older Safari/Firefox, insecure context,
 *  or a fetch/CORS error — so callers can fall back (e.g. open the image to save).
 *  Note: some Safari versions reject clipboard writes that happen after an await;
 *  those users hit the fallback. */
export async function copyImageToClipboard(url: string): Promise<boolean> {
  try {
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) return false
    const res = await fetch(url)
    if (!res.ok) return false
    const blob = await res.blob()
    await navigator.clipboard.write([new ClipboardItem({ [blob.type || "image/png"]: blob })])
    return true
  } catch {
    return false
  }
}
