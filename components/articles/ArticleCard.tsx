import Link from "next/link"
import type { ArticlePreview, CmsLocale } from "@/lib/cms/articles"
import { CoverArt } from "./CoverArt"

function categoryLabel(tag: { slug: string; name: string }, locale: CmsLocale) {
  const value = tag.slug.toLowerCase()
  if (value === "local-mock") return null
  if (["operations", "ops", "protocol", "frbtc"].includes(value)) return locale === "zh" ? "协议" : "Protocol"
  if (["product", "release", "releases", "docs", "documentation", "subfrost"].includes(value)) return locale === "zh" ? "开发者" : "Developer"
  if (["research", "bitcoin", "alkanes"].includes(value)) return locale === "zh" ? "研究" : tag.name
  return tag.name
}

function articleDate(value: string | null, locale: CmsLocale) {
  if (!value) return ""
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value))
}

// One card in the feed / author grid.
export function ArticleCard({ a, locale = "en", coverVariant }: { a: ArticlePreview; locale?: CmsLocale; coverLabel?: string; coverVariant?: number | string }) {
  const tag = a.tags.map((item) => categoryLabel(item, locale)).find((item): item is string => Boolean(item))
  const href = locale === "zh" ? `/articles/${a.slug}?lang=zh` : `/articles/${a.slug}`

  return (
    <Link href={href} className="ed-card">
      <div className="ed-cover-frame">
        {a.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={a.coverImage} alt="" className="h-[220px] w-full object-contain sm:h-[300px] sm:object-cover" />
        ) : (
          <CoverArt className="h-[220px] sm:h-[300px]" variant={coverVariant ?? a.slug} />
        )}
      </div>
      <div className="flex flex-1 flex-col pt-4">
        <h3
          className="font-display text-balance text-[20px] font-normal leading-[1.28]"
          style={{ color: "var(--ed-ink)" }}
        >
          {a.title}
        </h3>
        <div className="font-display mt-4 flex flex-wrap gap-x-3 gap-y-1 text-[14px] font-medium" style={{ color: "var(--ed-muted)" }}>
          {tag ? <span style={{ color: "var(--ed-ink)" }}>{tag}</span> : null}
          {a.publishedAt ? <span>{articleDate(a.publishedAt, locale)}</span> : null}
        </div>
      </div>
    </Link>
  )
}
