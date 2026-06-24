import { unsubscribeByToken } from "@/lib/cms/article-subscribe"

export const dynamic = "force-dynamic"

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; lang?: string }>
}) {
  const { token, lang } = await searchParams
  const zh = lang === "zh"
  const result = token ? await unsubscribeByToken(token) : { unsubscribed: false, kind: null as null }

  const copy = result.unsubscribed
    ? zh
      ? { h: "已退订", p: "你将不再收到这些邮件。" }
      : { h: "You're unsubscribed", p: "You won't receive these emails anymore." }
    : zh
      ? { h: "链接无效", p: "这个退订链接无效或已过期。" }
      : { h: "Link invalid", p: "This unsubscribe link is invalid or has expired." }

  return (
    <main style={{ maxWidth: 480, margin: "80px auto", padding: 24, textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, marginBottom: 12 }}>{copy.h}</h1>
      <p style={{ color: "#475569" }}>{copy.p}</p>
      <p style={{ marginTop: 24 }}><a href="/articles" style={{ color: "#0ea5e9" }}>{zh ? "返回文章" : "Back to articles"}</a></p>
    </main>
  )
}
