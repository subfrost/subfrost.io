import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { getPublishedArticle, type CmsLocale } from "@/lib/cms/articles"
import { Markdown } from "@/lib/cms/markdown"
import { AuthorByline, Avatar } from "@/components/articles/AuthorByline"
import { LocaleToggle } from "@/components/articles/LocaleToggle"

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
    <main className="min-h-screen bg-white text-zinc-900">
      <header className="border-b border-zinc-200">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5">
          <Link href="/" className="text-xl font-bold tracking-tight">SUBFROST</Link>
          <Link href="/articles" className="text-sm text-zinc-600 hover:text-zinc-900">All articles</Link>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-5 py-12">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex gap-2 text-xs uppercase tracking-wide text-[#1a4d8f]">
            {a.tags.map((t) => <span key={t.slug}>{t.name}</span>)}
          </div>
          <LocaleToggle available={a.availableLocales} current={a.locale} />
        </div>

        <h1 className="mb-6 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">{a.title}</h1>

        <div className="mb-10 border-b border-zinc-200 pb-8">
          <AuthorByline author={a.author} publishedAt={a.publishedAt} readingMinutes={a.readingMinutes} size={48} />
        </div>

        {a.coverImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={a.coverImage} alt="" className="mb-10 w-full rounded-xl object-cover" />
        )}

        <Markdown variant="article">{a.body}</Markdown>

        {a.author.bio && (
          <div className="mt-16 flex items-start gap-4 border-t border-zinc-200 pt-8">
            <Avatar name={a.author.name} src={a.author.avatarUrl} size={56} />
            <div>
              <div className="text-xs uppercase tracking-wide text-zinc-400">Written by</div>
              <div className="text-lg font-semibold text-zinc-900">{a.author.name}</div>
              <p className="mt-1 text-zinc-600">{a.author.bio}</p>
            </div>
          </div>
        )}
      </article>
    </main>
  )
}
