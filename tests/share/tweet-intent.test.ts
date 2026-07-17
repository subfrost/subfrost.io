import { describe, it, expect } from "vitest"
import { tweetIntentUrl, X_HANDLE } from "@/lib/share"

describe("tweetIntentUrl", () => {
  it("builds an X intent url with encoded text and url", () => {
    const u = tweetIntentUrl("Alkanes' share: 62.4% @subfrost_news", "https://subfrost.io/metrics")
    expect(u).toBe(
      "https://twitter.com/intent/tweet?text=Alkanes'%20share%3A%2062.4%25%20%40subfrost_news&url=https%3A%2F%2Fsubfrost.io%2Fmetrics",
    )
  })

  it("encodes reserved characters so caller data never breaks the query string", () => {
    const u = tweetIntentUrl("a&b=c", "https://x.io/p?q=1&r=2")
    expect(u).toContain("text=a%26b%3Dc")
    expect(u).toContain("url=https%3A%2F%2Fx.io%2Fp%3Fq%3D1%26r%3D2")
    // exactly one literal & — the separator between text= and url=
    expect(u.match(/&/g)?.length).toBe(1)
  })

  it("exposes the handle used in share copy", () => {
    expect(X_HANDLE).toBe("subfrost_news")
  })
})
