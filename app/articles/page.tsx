import Link from "next/link"
import type { Metadata } from "next"
import { getPublishedPreviews, type CmsLocale } from "@/lib/cms/articles"
import { ArticleCard } from "@/components/articles/ArticleCard"
import { AuthorByline } from "@/components/articles/AuthorByline"
import { CoverArt } from "@/components/articles/CoverArt"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Articles — SUBFROST",
  description: "Research, releases, and field notes from the SUBFROST team.",
}

export default async function ArticlesIndex({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>
}) {
  const { lang } = await searchParams
  const locale: CmsLocale = lang === "zh" ? "zh" : "en"
  const articles = await getPublishedPreviews({ limit: 30, locale })
  const [lead, ...rest] = articles

  return (
    <main className="mx-auto max-w-[1120px] px-6 pb-16 pt-12 sm:px-7">
      <h1 className="font-display text-[44px] font-semibold leading-[1.05] sm:text-[56px]" style={{ color: "var(--ed-ink)" }}>
        Articles
      </h1>
      <p className="font-reading mt-2 text-[19px] sm:text-[21px]" style={{ color: "var(--ed-muted)" }}>
        Research, releases, and field notes from SUBFROST.
      </p>

      {articles.length === 0 ? (
        <div
          className="font-reading mt-12 rounded-2xl border border-dashed p-16 text-center text-[17px]"
          style={{ borderColor: "var(--ed-hair)", color: "var(--ed-muted)" }}
        >
          No articles published yet.
        </div>
      ) : (
        <>
          {lead ? (
            <Link
              href={`/articles/${lead.slug}`}
              className="group mt-10 grid items-center gap-8 border-b pb-12 md:grid-cols-[1.15fr_1fr] md:gap-10"
              style={{ borderColor: "var(--ed-hair)" }}
            >
              {lead.coverImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={lead.coverImage} alt="" className="h-[300px] w-full rounded-[14px] object-cover" />
              ) : (
                <CoverArt label={lead.tags[0]?.name} className="h-[300px] rounded-[14px]" />
              )}
              <div>
                <div className="ed-eyebrow ed-eyebrow--lead mb-3">{lead.tags[0]?.name ?? "Featured"}</div>
                <h2
                  className="font-display text-[30px] font-semibold leading-[1.12] transition-opacity group-hover:opacity-80 sm:text-[38px]"
                  style={{ color: "var(--ed-ink)" }}
                >
                  {lead.title}
                </h2>
                <p className="font-reading mb-5 mt-3 text-[18px] leading-[1.5]" style={{ color: "var(--ed-muted)" }}>
                  {lead.excerpt}
                </p>
                <AuthorByline
                  author={lead.author}
                  publishedAt={lead.publishedAt}
                  readingMinutes={lead.readingMinutes}
                  size={40}
                  variant="compact"
                  linkAuthor={false}
                />
              </div>
            </Link>
          ) : null}

          {rest.length > 0 ? (
            <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((a) => (
                <ArticleCard key={a.slug} a={a} />
              ))}
            </div>
          ) : null}
        </>
      )}
    </main>
  )
}
