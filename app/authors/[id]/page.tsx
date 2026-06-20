import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { getAuthorProfile, getAuthorArticles, type CmsLocale } from "@/lib/cms/articles"
import { ArticleCard } from "@/components/articles/ArticleCard"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const author = await getAuthorProfile(id)
  if (!author) return { title: "Not found" }
  return {
    title: `${author.name} — SUBFROST`,
    description: author.bio ?? `Articles by ${author.name} on SUBFROST.`,
  }
}

export default async function AuthorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ lang?: string }>
}) {
  const { id } = await params
  const { lang } = await searchParams
  const locale: CmsLocale = lang === "zh" ? "zh" : "en"
  const author = await getAuthorProfile(id)
  if (!author) notFound()
  const articles = await getAuthorArticles(id, locale)

  const twitterHandle = author.twitter?.replace(/^@/, "").replace(/^https?:\/\/(x|twitter)\.com\//i, "")

  return (
    <main>
      {/* Profile band */}
      <section style={{ background: "var(--ed-band)", borderBottom: "1px solid var(--ed-hair)" }}>
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-8 px-6 py-12 sm:px-7">
          <span
            className="ed-avatar"
            style={{
              width: 118,
              height: 118,
              fontSize: 46,
              boxShadow: "0 0 0 4px var(--ed-canvas), 0 0 0 6px var(--ed-ice)",
            }}
          >
            {author.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={author.avatarUrl} alt={author.name} className="h-full w-full object-cover" />
            ) : (
              author.name[0]?.toUpperCase()
            )}
          </span>
          <div className="min-w-[280px] flex-1">
            <div className="ed-eyebrow mb-2">Author</div>
            <h1 className="font-display text-[40px] font-semibold leading-[1.05] sm:text-[44px]" style={{ color: "var(--ed-ink)" }}>
              {author.name}
            </h1>
            {author.bio ? (
              <p className="font-reading mt-2 max-w-[620px] text-[18px] leading-[1.5] sm:text-[19px]" style={{ color: "var(--ed-body)" }}>
                {author.bio}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap items-center gap-5 text-[15px]" style={{ color: "var(--ed-muted)" }}>
              {twitterHandle ? (
                <a
                  href={`https://x.com/${twitterHandle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--ed-accent)" }}
                  className="hover:underline"
                >
                  𝕏 @{twitterHandle}
                </a>
              ) : null}
              <span>
                <b style={{ color: "var(--ed-ink)", fontWeight: 500 }}>{author.articleCount}</b>{" "}
                {author.articleCount === 1 ? "article" : "articles"}
              </span>
              <span>Joined {author.joinedYear}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Their articles */}
      <div className="mx-auto max-w-[1120px] px-6 pb-16 sm:px-7">
        <h2 className="font-display mb-1 mt-10 text-[24px] font-semibold" style={{ color: "var(--ed-ink)" }}>
          Articles by {author.name}
        </h2>
        {articles.length === 0 ? (
          <p className="font-reading mt-4 text-[17px]" style={{ color: "var(--ed-muted)" }}>
            No published articles yet.
          </p>
        ) : (
          <div className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((a) => (
              <ArticleCard key={a.slug} a={a} />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
