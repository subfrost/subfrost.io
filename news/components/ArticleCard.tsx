import Link from "next/link"
import { format } from "date-fns"
import { Badge } from "@/components/ui/badge"

export interface ArticlePreview {
  slug: string
  title: string
  excerpt: string
  coverImage: string | null
  publishedAt: string | null
  author: string
  tags: { slug: string; name: string }[]
  readingMinutes: number
}

export function ArticleCard({ a }: { a: ArticlePreview }) {
  return (
    <Link
      href={`/article/${a.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-zinc-800 bg-card/60 transition-colors hover:border-zinc-600"
    >
      {a.coverImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={a.coverImage}
          alt=""
          className="h-44 w-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
        />
      ) : (
        <div className="h-44 w-full bg-gradient-to-br from-brand-blue/40 to-zinc-900" />
      )}
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex flex-wrap gap-1.5">
          {a.tags.slice(0, 3).map((t) => (
            <Badge key={t.slug}>{t.name}</Badge>
          ))}
        </div>
        <h3 className="text-lg font-semibold leading-snug text-white">{a.title}</h3>
        <p className="line-clamp-3 flex-1 text-sm text-zinc-400">{a.excerpt}</p>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span>{a.author}</span>
          <span>·</span>
          <span>
            {a.publishedAt ? format(new Date(a.publishedAt), "MMM d, yyyy") : "Draft"}
          </span>
          <span>·</span>
          <span>{a.readingMinutes} min read</span>
        </div>
      </div>
    </Link>
  )
}
