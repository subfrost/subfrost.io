import Link from "next/link"
import { Markdown } from "@/lib/cms/markdown"
import type { AuthorProfile, CmsLocale } from "@/lib/cms/articles"
import { AuthorByline, Avatar } from "@/components/articles/AuthorByline"
import { buildInlineSvgMap } from "@/lib/cms/inline-svg"

export interface ArticleViewData {
  title: string
  excerpt: string
  body: string
  sources?: string
  publishedAt: string | null
  tags: { slug: string; name: string }[]
  author?: AuthorProfile
  coAuthors?: AuthorProfile[]
  readingMinutes?: number
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

/** The published article body — header (date + primary category, title, excerpt,
 *  author byline) and Markdown content, closing with the author bio card.
 *  Rendered identically by the public page and the admin preview so the preview
 *  matches published output. The author UI only renders when `author` is given. */
export async function ArticleView({ article, locale }: { article: ArticleViewData; locale: CmsLocale }) {
  const inlinedSvgs = await buildInlineSvgMap(article.body)
  const fallback = locale === "zh" ? "文章" : "Article"
  const primaryTag = article.tags.map((t) => categoryLabel(t, locale)).find((t): t is string => Boolean(t)) ?? fallback
  const author = article.author
  return (
    <article className="mx-auto px-6 pb-20 pt-24 sm:px-8 lg:pt-28">
      <header className="mx-auto max-w-[680px] text-left">
        <div className="font-display mb-5 flex flex-wrap gap-x-4 gap-y-2 text-[14px] font-medium" style={{ color: "var(--ed-muted)" }}>
          {/* Date lives in the byline when an author is shown, so avoid repeating it here. */}
          {!author && article.publishedAt ? (
            <span>{new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date(article.publishedAt))}</span>
          ) : null}
          <span>{primaryTag}</span>
        </div>

        <h1
          className="font-display max-w-[680px] text-balance text-[38px] font-medium leading-[1.02] sm:text-[56px] lg:text-[64px]"
          style={{ color: "var(--ed-ink)" }}
        >
          {article.title}
        </h1>

        {article.excerpt ? (
          <p className="font-display mt-6 max-w-[680px] text-[17px] leading-[1.55]" style={{ color: "var(--ed-ink)" }}>
            {article.excerpt}
          </p>
        ) : null}

        {author ? (
          <div className="mt-7 flex justify-start">
            <AuthorByline author={author} coAuthors={article.coAuthors ?? []} publishedAt={article.publishedAt} readingMinutes={article.readingMinutes ?? 0} size={32} variant="reader" locale={locale} />
          </div>
        ) : null}
      </header>

      <div className="mx-auto mt-12 max-w-[680px] sm:mt-14 lg:mt-16">
        <Markdown variant="article" inlinedSvgs={inlinedSvgs}>{article.body}</Markdown>
      </div>

      {(article.sources ?? "").trim() ? (
        <aside className="ed-sources">
          <div className="ed-sources-label">{locale === "zh" ? "来源" : "Sources"}</div>
          <Markdown variant="article">{article.sources as string}</Markdown>
        </aside>
      ) : null}

      {(() => {
        const contributors = [author, ...(article.coAuthors ?? [])].filter((a): a is AuthorProfile => Boolean(a?.bio))
        if (contributors.length === 0) return null
        return (
          <div className="mx-auto mt-14 max-w-[680px] space-y-4">
            {contributors.map((a, i) => {
              const href = locale === "zh" ? `/authors/${a.id}?lang=zh` : `/authors/${a.id}`
              return (
                <aside key={a.id} className="flex items-start gap-4 rounded-[14px] border p-5" style={{ borderColor: "var(--ed-hair)" }}>
                  <Avatar name={a.name} src={a.avatarUrl} size={48} />
                  <div>
                    {i === 0 ? (
                      <div className="font-display text-[11px] uppercase tracking-[1.5px]" style={{ color: "var(--ed-muted)" }}>
                        {locale === "zh" ? "作者" : "Written by"}
                      </div>
                    ) : null}
                    <Link href={href} className="font-display text-[15px] font-medium hover:underline" style={{ color: "var(--ed-ink)" }}>
                      {a.name}
                    </Link>
                    <p className="font-reading mt-1 text-[15px] leading-[1.6]" style={{ color: "var(--ed-body)" }}>
                      {a.bio}
                    </p>
                  </div>
                </aside>
              )
            })}
          </div>
        )
      })()}
    </article>
  )
}
