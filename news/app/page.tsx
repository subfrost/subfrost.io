import Link from "next/link"
import FrostBackdrop from "@/components/FrostBackdrop"
import { Nav } from "@/components/Nav"
import { ArticleCard } from "@/components/ArticleCard"
import { getPublishedPreviews } from "@/lib/articles"

// Rendered per request (Cloudflare caches HTML at the edge). Avoids any DB
// access during `next build` in the container image.
export const dynamic = "force-dynamic"

export default async function HomePage() {
  const articles = await getPublishedPreviews({ limit: 24 })
  const [lead, ...rest] = articles

  return (
    <div className="relative min-h-screen">
      <Nav />
      <div className="relative overflow-hidden border-b border-zinc-800/80">
        <FrostBackdrop count={70} />
        <div className="relative mx-auto max-w-5xl px-4 py-16">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            SUBFROST News
          </h1>
          <p className="mt-3 max-w-2xl text-zinc-400">
            Research, releases, and field notes on Bitcoin-native yield, frBTC, and
            the Alkanes ecosystem.
          </p>
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-4 py-10">
        {articles.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800 p-16 text-center text-zinc-500">
            No articles published yet. Check back soon.
          </div>
        ) : (
          <>
            {lead && (
              <Link
                href={`/article/${lead.slug}`}
                className="group mb-10 grid gap-6 overflow-hidden rounded-2xl border border-zinc-800 bg-card/60 p-2 transition-colors hover:border-zinc-600 md:grid-cols-2"
              >
                {lead.coverImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={lead.coverImage}
                    alt=""
                    className="h-64 w-full rounded-xl object-cover md:h-full"
                  />
                ) : (
                  <div className="h-64 w-full rounded-xl bg-gradient-to-br from-brand-blue/40 to-zinc-900 md:h-full" />
                )}
                <div className="flex flex-col justify-center gap-3 p-6">
                  <span className="text-xs uppercase tracking-widest text-brand-ice/80">
                    Featured
                  </span>
                  <h2 className="text-2xl font-bold text-white">{lead.title}</h2>
                  <p className="text-zinc-400">{lead.excerpt}</p>
                  <div className="text-xs text-zinc-500">
                    {lead.author} · {lead.readingMinutes} min read
                  </div>
                </div>
              </Link>
            )}

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((a) => (
                <ArticleCard key={a.slug} a={a} />
              ))}
            </div>
          </>
        )}
      </main>

      <footer className="border-t border-zinc-800/80 py-8 text-center text-sm text-zinc-500">
        <a href="https://subfrost.io" className="hover:text-white">
          subfrost.io
        </a>{" "}
        · SUBFROST News
      </footer>
    </div>
  )
}
