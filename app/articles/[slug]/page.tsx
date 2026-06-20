import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { getPublishedArticle, type CmsLocale } from "@/lib/cms/articles"
import { Markdown } from "@/lib/cms/markdown"
import { AuthorByline, Avatar } from "@/components/articles/AuthorByline"
import { CoverArt } from "@/components/articles/CoverArt"
import { ReadingProgress } from "@/components/articles/ReadingProgress"

export const dynamic = "force-dynamic"

export async function generateMetadata({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ lang?: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const { lang } = await searchParams
  const a = await getPublishedArticle(slug, lang === "zh" ? "zh" : "en")
  if (!a) return { title: "Not found" }
  return {
    title: `${a.title} — SUBFROST`,
    description: a.excerpt,
    openGraph: { title: a.title, description: a.excerpt, type: "article", images: a.coverImage ? [a.coverImage] : undefined },
  }
}

export default async function ArticlePage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ lang?: string }>
}) {
  const { slug } = await params
  const { lang } = await searchParams
  const locale: CmsLocale = lang === "zh" ? "zh" : "en"
  const a = await getPublishedArticle(slug, locale)
  if (!a) notFound()

  return (
    <>
      <ReadingProgress />
      <article className="mx-auto max-w-[720px] px-6 pb-16 pt-14">
        <div className="mb-3.5">
          <div className="ed-eyebrow">{a.tags[0]?.name ?? "Article"}</div>
        </div>

        <h1
          className="font-display text-[34px] font-semibold leading-[1.08] sm:text-[52px]"
          style={{ color: "var(--ed-ink)" }}
        >
          {a.title}
        </h1>

        {a.excerpt ? (
          <p className="font-reading mt-4 text-[20px] leading-[1.5] sm:text-[21px]" style={{ color: "var(--ed-muted)" }}>
            {a.excerpt}
          </p>
        ) : null}

        <div className="mt-7 border-b pb-6" style={{ borderColor: "var(--ed-hair)" }}>
          <AuthorByline author={a.author} publishedAt={a.publishedAt} readingMinutes={a.readingMinutes} size={48} />
        </div>

        {a.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={a.coverImage} alt="" className="my-8 h-[330px] w-full rounded-[14px] object-cover" />
        ) : (
          <CoverArt label={a.tags[0]?.name} className="my-8 h-[330px] rounded-[14px]" />
        )}

        <Markdown variant="article">{a.body}</Markdown>

        {a.author.bio ? (
          <div
            className="mt-14 flex items-start gap-4 rounded-[14px] border p-5"
            style={{ borderColor: "var(--ed-hair)" }}
          >
            <Avatar name={a.author.name} src={a.author.avatarUrl} size={48} />
            <div>
              <div className="text-[11px] uppercase tracking-[1.5px]" style={{ color: "var(--ed-muted)" }}>
                Written by
              </div>
              <Link
                href={`/authors/${a.author.id}`}
                className="font-reading text-[18px] font-medium hover:underline"
                style={{ color: "var(--ed-ink)" }}
              >
                {a.author.name}
              </Link>
              <p className="font-reading mt-0.5 text-[14px]" style={{ color: "var(--ed-muted)" }}>
                {a.author.bio}
              </p>
            </div>
          </div>
        ) : null}
      </article>
    </>
  )
}
