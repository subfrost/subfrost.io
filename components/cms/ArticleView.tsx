import { Markdown } from "@/lib/cms/markdown"
import type { CmsLocale } from "@/lib/cms/articles"

export interface ArticleViewData {
  title: string
  excerpt: string
  body: string
  sources?: string
  publishedAt: string | null
  tags: { slug: string; name: string }[]
}

// Maps a tag to its display category label per locale. Shared by the public
// article page (also used in generateMetadata) and the admin preview.
export function categoryLabel(tag: { slug: string; name: string }, locale: CmsLocale): string | null {
  const value = tag.slug.toLowerCase()
  if (value === "local-mock") return null
  if (["operations", "ops", "protocol", "frbtc"].includes(value)) return locale === "zh" ? "协议" : "Protocol"
  if (["product", "release", "releases", "docs", "documentation", "subfrost"].includes(value)) return locale === "zh" ? "开发者" : "Developer"
  if (["research", "bitcoin", "alkanes"].includes(value)) return locale === "zh" ? "研究" : tag.name
  return tag.name
}

/** The published article body — header (date + primary category, title, excerpt)
 *  and Markdown content. Rendered identically by the public page and the admin
 *  preview so the preview matches published output. */
export function ArticleView({ article, locale }: { article: ArticleViewData; locale: CmsLocale }) {
  const fallback = locale === "zh" ? "文章" : "Article"
  const primaryTag = article.tags.map((t) => categoryLabel(t, locale)).find((t): t is string => Boolean(t)) ?? fallback
  return (
    <article className="mx-auto px-6 pb-20 pt-24 sm:px-8 lg:pt-28">
      <header className="mx-auto max-w-[920px] text-center">
        <div className="font-display mb-5 flex flex-wrap justify-center gap-x-4 gap-y-2 text-[14px] font-medium" style={{ color: "var(--ed-muted)" }}>
          {article.publishedAt ? (
            <span>{new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date(article.publishedAt))}</span>
          ) : null}
          <span>{primaryTag}</span>
        </div>

        <h1
          className="font-display mx-auto max-w-[920px] text-balance text-[38px] font-medium leading-[1.02] sm:text-[56px] lg:text-[64px]"
          style={{ color: "var(--ed-ink)" }}
        >
          {article.title}
        </h1>

        {article.excerpt ? (
          <p className="font-display mx-auto mt-7 max-w-[620px] text-[17px] leading-[1.55]" style={{ color: "var(--ed-ink)" }}>
            {article.excerpt}
          </p>
        ) : null}
      </header>

      <div className="mx-auto mt-24 max-w-[680px]">
        <Markdown variant="article">{article.body}</Markdown>
      </div>

      {(article.sources ?? "").trim() ? (
        <aside className="ed-sources">
          <div className="ed-sources-label">{locale === "zh" ? "来源" : "Sources"}</div>
          <Markdown variant="article">{article.sources as string}</Markdown>
        </aside>
      ) : null}
    </article>
  )
}
