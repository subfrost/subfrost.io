import Link from "next/link"
import type { Metadata } from "next"
import { getPublishedPreviews, type CmsLocale } from "@/lib/cms/articles"
import { AuthorByline } from "@/components/articles/AuthorByline"

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
    <main className="min-h-screen bg-white text-zinc-900">
      <header className="border-b border-zinc-200">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
          <Link href="/" className="text-xl font-bold tracking-tight">SUBFROST</Link>
          <nav className="flex items-center gap-6 text-sm text-zinc-600">
            <Link href="/articles" className="font-medium text-zinc-900">Articles</Link>
            <Link href="/" className="hover:text-zinc-900">Home</Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5 py-12">
        <h1 className="mb-2 text-4xl font-bold tracking-tight">Articles</h1>
        <p className="mb-12 text-lg text-zinc-500">Research, releases, and field notes from SUBFROST.</p>

        {articles.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 p-16 text-center text-zinc-400">
            No articles published yet.
          </div>
        ) : (
          <>
            {lead && (
              <Link href={`/articles/${lead.slug}`} className="group mb-14 grid gap-8 md:grid-cols-2">
                {lead.coverImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={lead.coverImage} alt="" className="h-72 w-full rounded-xl object-cover" />
                ) : (
                  <div className="h-72 w-full rounded-xl bg-gradient-to-br from-[#1a4d8f]/20 to-zinc-100" />
                )}
                <div className="flex flex-col justify-center">
                  <div className="mb-2 flex gap-2 text-xs uppercase tracking-wide text-[#1a4d8f]">
                    {lead.tags.slice(0, 2).map((t) => <span key={t.slug}>{t.name}</span>)}
                  </div>
                  <h2 className="mb-3 text-3xl font-bold leading-tight group-hover:underline">{lead.title}</h2>
                  <p className="mb-5 text-lg text-zinc-600">{lead.excerpt}</p>
                  <AuthorByline author={lead.author} publishedAt={lead.publishedAt} readingMinutes={lead.readingMinutes} />
                </div>
              </Link>
            )}

            <div className="grid gap-x-10 gap-y-12 border-t border-zinc-200 pt-12 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((a) => (
                <Link key={a.slug} href={`/articles/${a.slug}`} className="group flex flex-col">
                  {a.coverImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.coverImage} alt="" className="mb-4 h-44 w-full rounded-lg object-cover" />
                  ) : (
                    <div className="mb-4 h-44 w-full rounded-lg bg-gradient-to-br from-[#1a4d8f]/15 to-zinc-100" />
                  )}
                  <div className="mb-2 flex gap-2 text-xs uppercase tracking-wide text-[#1a4d8f]">
                    {a.tags.slice(0, 2).map((t) => <span key={t.slug}>{t.name}</span>)}
                  </div>
                  <h3 className="mb-2 text-xl font-bold leading-snug group-hover:underline">{a.title}</h3>
                  <p className="mb-4 line-clamp-2 flex-1 text-zinc-600">{a.excerpt}</p>
                  <AuthorByline author={a.author} publishedAt={a.publishedAt} readingMinutes={a.readingMinutes} size={32} />
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  )
}
