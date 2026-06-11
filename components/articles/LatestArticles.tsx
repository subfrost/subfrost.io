"use client"

import useSWR from "swr"

// Homepage widget: top published articles from the same-origin API. Renders
// nothing if empty, so the homepage degrades gracefully.

interface Preview {
  slug: string
  title: string
  excerpt: string
  coverImage: string | null
  publishedAt: string | null
  readingMinutes: number
  author: { name: string; avatarUrl: string | null }
  tags: { slug: string; name: string }[]
}

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(String(r.status))
    return r.json()
  })

export default function LatestArticles() {
  const { data } = useSWR<{ articles: Preview[] }>("/api/articles?limit=3", fetcher, {
    revalidateOnFocus: false,
  })
  const articles = data?.articles ?? []
  if (articles.length === 0) return null

  return (
    <div id="articles" className="pt-10 border-t border-slate-300/20">
      <div className="text-center mb-8">
        <h3 className="text-3xl md:text-4xl font-bold uppercase tracking-wider text-white snow-title-no-filter mb-4">
          FROM THE SUBFROST BLOG
        </h3>
        <p className="text-lg text-gray-400 max-w-2xl mx-auto">
          Research, releases, and field notes from the team.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {articles.map((a) => (
          <a key={a.slug} href={`/articles/${a.slug}`}
            className="group flex flex-col overflow-hidden rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm transition-colors hover:border-white/30">
            {a.coverImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.coverImage} alt="" className="h-40 w-full object-cover opacity-90 transition-opacity group-hover:opacity-100" />
            ) : (
              <div className="h-40 w-full bg-gradient-to-br from-[hsl(var(--brand-blue))] to-slate-900" />
            )}
            <div className="flex flex-1 flex-col gap-2 p-5">
              <div className="flex flex-wrap gap-1.5">
                {a.tags.slice(0, 2).map((t) => (
                  <span key={t.slug} className="rounded-full border border-white/15 px-2 py-0.5 text-[0.7rem] text-gray-300">{t.name}</span>
                ))}
              </div>
              <h4 className="text-lg font-semibold leading-snug text-white">{a.title}</h4>
              <p className="line-clamp-2 flex-1 text-sm text-gray-400">{a.excerpt}</p>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                {a.author.avatarUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.author.avatarUrl} alt="" className="h-5 w-5 rounded-full object-cover" />
                )}
                <span>{a.author.name}</span><span>·</span><span>{a.readingMinutes} min</span>
              </div>
            </div>
          </a>
        ))}
      </div>

      <div className="text-center mt-8">
        <a href="/articles" className="inline-block rounded-full border border-white/20 px-5 py-2 text-sm text-white transition-colors hover:bg-white/10">
          Read all articles →
        </a>
      </div>
    </div>
  )
}
