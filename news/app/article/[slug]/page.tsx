import { notFound } from "next/navigation"
import type { Metadata } from "next"
import Link from "next/link"
import { format } from "date-fns"
import { Nav } from "@/components/Nav"
import { Badge } from "@/components/ui/badge"
import { Markdown } from "@/lib/markdown"
import { getPublishedArticle } from "@/lib/articles"

// Rendered per request (no DB access at image build time).
export const dynamic = "force-dynamic"

export async function generateMetadata({
  params,
}: {
  params: { slug: string }
}): Promise<Metadata> {
  const a = await getPublishedArticle(params.slug)
  if (!a) return { title: "Not found" }
  return {
    title: a.title,
    description: a.excerpt,
    openGraph: {
      title: a.title,
      description: a.excerpt,
      type: "article",
      images: a.coverImage ? [a.coverImage] : undefined,
    },
  }
}

export default async function ArticlePage({
  params,
}: {
  params: { slug: string }
}) {
  const a = await getPublishedArticle(params.slug)
  if (!a) notFound()

  return (
    <div className="min-h-screen">
      <Nav />
      <article className="mx-auto max-w-3xl px-4 py-12">
        <Link href="/" className="text-sm text-zinc-500 hover:text-white">
          ← All articles
        </Link>

        <div className="mt-6 flex flex-wrap gap-1.5">
          {a.tags.map((t) => (
            <Badge key={t.slug}>{t.name}</Badge>
          ))}
        </div>

        <h1 className="mt-4 text-3xl font-bold leading-tight text-white sm:text-4xl">
          {a.title}
        </h1>

        <div className="mt-3 flex items-center gap-2 text-sm text-zinc-500">
          <span>{a.author}</span>
          <span>·</span>
          <span>
            {a.publishedAt ? format(new Date(a.publishedAt), "MMMM d, yyyy") : ""}
          </span>
          <span>·</span>
          <span>{a.readingMinutes} min read</span>
        </div>

        {a.coverImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={a.coverImage}
            alt=""
            className="mt-8 w-full rounded-xl border border-zinc-800 object-cover"
          />
        )}

        <div className="mt-10">
          <Markdown>{a.body}</Markdown>
        </div>
      </article>
    </div>
  )
}
