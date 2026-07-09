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
