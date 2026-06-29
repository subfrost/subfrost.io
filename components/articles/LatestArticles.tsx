import { ArrowRight } from "lucide-react"
import { CoverArt } from "./CoverArt"
import { externalLinks } from "@/lib/external-links"

// Homepage widget: top published articles from the same-origin API. Renders
// nothing if empty, so the homepage degrades gracefully.

export interface HomepageArticlePreview {
  slug: string
  title: string
  excerpt: string
  coverImage: string | null
  publishedAt: string | null
  readingMinutes: number
  author: { id: string; name: string; avatarUrl: string | null }
  coAuthors?: { id: string; name: string; avatarUrl: string | null }[]
  tags: { slug: string; name: string }[]
}

type Locale = "en" | "zh"

type DisplayCard = {
  id: string
  title: string
  excerpt: string
  href: string
  coverImage: string | null
  coverVariant: number | string
  tags: { slug: string; name: string }[]
  meta: string
  author?: { id: string; name: string; avatarUrl: string | null }
  coAuthors?: { id: string; name: string; avatarUrl: string | null }[]
  readingMinutes?: number
}

const copy = {
  en: {
    title: "Articles",
    description: "Research, releases, and field notes from subfrost articles.",
    readAll: "All articles",
    minute: "min",
  },
  zh: {
    title: "文章",
    description: "来自 subfrost 的研究、发布与协议笔记。",
    readAll: "查看全部文章",
    minute: "分钟",
  },
} satisfies Record<Locale, { title: string; description: string; readAll: string; minute: string }>

const fallbackCards = {
  en: [
    {
      id: "docs",
      title: "Docs",
      excerpt: "Canonical product guides, setup paths, protocol references, and technical components.",
      href: externalLinks.docs,
      tags: [
        { slug: "developer", name: "Developer" },
        { slug: "protocol", name: "Protocol" },
      ],
      meta: "subfrost docs",
      coverVariant: 4,
    },
    {
      id: "api-docs",
      title: "subfrost API docs",
      excerpt: "Endpoint context for balances, wrapping state, transactions, market data, and integrations.",
      href: externalLinks.apiDocs,
      tags: [
        { slug: "developer", name: "Developer" },
        { slug: "api", name: "API" },
      ],
      meta: "subfrost docs",
      coverVariant: 5,
    },
  ],
  zh: [
    {
      id: "docs",
      title: "文档",
      excerpt: "产品指南、设置路径、协议参考与技术组件的权威入口。",
      href: externalLinks.docs,
      tags: [
        { slug: "developer", name: "开发者" },
        { slug: "protocol", name: "协议" },
      ],
      meta: "subfrost 文档",
      coverVariant: 4,
    },
    {
      id: "api-docs",
      title: "subfrost API 文档",
      excerpt: "余额、包装状态、交易、市场数据与集成端点说明。",
      href: externalLinks.apiDocs,
      tags: [
        { slug: "developer", name: "开发者" },
        { slug: "api", name: "API" },
      ],
      meta: "subfrost 文档",
      coverVariant: 5,
    },
  ],
} satisfies Record<Locale, Array<Omit<DisplayCard, "coverImage">>>

export default function LatestArticles({
  locale = "en",
  articles = [],
}: {
  locale?: Locale
  articles?: HomepageArticlePreview[]
}) {
  const t = copy[locale]
  const withLocale = (href: string) => {
    if (href.startsWith("http")) return href
    return locale === "zh" ? `${href}?lang=zh` : href
  }
  const articleCards: DisplayCard[] = articles.slice(0, 3).map((article, index) => ({
    id: article.slug,
    title: article.title,
    excerpt: article.excerpt,
    href: withLocale(`/articles/${article.slug}`),
    coverImage: article.coverImage,
    coverVariant: index,
    tags: article.tags,
    meta: `${article.readingMinutes} ${t.minute}`,
    author: article.author,
    coAuthors: article.coAuthors,
    readingMinutes: article.readingMinutes,
  }))
  const cards: DisplayCard[] = [
    ...articleCards,
    ...fallbackCards[locale].filter((card) => !articleCards.some((article) => article.href === card.href)).map((card, index) => ({
      ...card,
      coverImage: null,
      coverVariant: articleCards.length + index,
    })),
  ].slice(0, 3)

  return (
    <div id="articles" className="w-full">
      <div className="mb-9 max-w-[620px]">
        <h3 className="font-display text-[34px] font-normal leading-[1.08] sm:text-[42px]" style={{ color: "var(--ed-ink)" }}>
          {t.title}
        </h3>
        <p className="mt-4 text-[17px] leading-[1.5]" style={{ color: "var(--ed-muted)" }}>
          {t.description}
        </p>
      </div>

      <div className="grid gap-x-8 gap-y-10 lg:grid-cols-3">
        {cards.map((card) => (
          <article key={card.id} className="ed-card">
            <a href={card.href} className="ed-cover-frame aspect-[16/9]">
              {card.coverImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={card.coverImage}
                  alt=""
                  width={960}
                  height={540}
                  loading="lazy"
                  decoding="async"
                  className="ed-cms-cover"
                />
              ) : (
                <CoverArt className="h-full w-full" variant={card.coverVariant} />
              )}
            </a>
            <div className="flex flex-1 flex-col gap-2 pt-4">
              <div className="flex flex-wrap gap-x-2 gap-y-1">
                {card.tags.slice(0, 2).map((tag) => (
                  <span key={tag.slug} className="text-[0.72rem] font-medium" style={{ color: "var(--ed-muted)" }}>{tag.name}</span>
                ))}
              </div>
              <h4 className="font-display text-[20px] font-normal leading-[1.28]" style={{ color: "var(--ed-ink)" }}>
                <a href={card.href}>
                  {card.title}
                </a>
              </h4>
              <p className="line-clamp-2 flex-1 text-[14px] leading-[1.5]" style={{ color: "var(--ed-muted)" }}>{card.excerpt}</p>
              <div className="flex items-center gap-2 text-xs" style={{ color: "var(--ed-muted)" }}>
                {card.author?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={card.author.avatarUrl}
                    alt=""
                    width={20}
                    height={20}
                    loading="lazy"
                    decoding="async"
                    className="h-5 w-5 rounded-full object-cover"
                  />
                ) : null}
                {card.author ? (
                  <>
                    <a href={withLocale(`/authors/${card.author.id}`)} style={{ color: "var(--ed-ink)" }}>
                      {formatAuthorNames(card.author, card.coAuthors ?? [])}
                    </a>
                    <span>·</span>
                  </>
                ) : null}
                <span>{card.meta}</span>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-8">
        <a href={withLocale("/articles")} className="group font-display inline-flex items-center gap-1.5 text-[15px] font-normal" style={{ color: "var(--ed-ink)" }}>
          {t.readAll}
          <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" strokeWidth={1.7} />
        </a>
      </div>
    </div>
  )
}

function formatAuthorNames(author: { name: string }, coAuthors: { name: string }[]) {
  const names = [author.name, ...coAuthors.map((coAuthor) => coAuthor.name)]
  if (names.length <= 2) return names.join(" and ")
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`
}
