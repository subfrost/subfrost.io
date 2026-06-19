import Link from "next/link"
import type { ArticlePreview } from "@/lib/cms/articles"
import { CoverArt } from "./CoverArt"
import { AuthorByline } from "./AuthorByline"

// One card in the feed / author grid.
export function ArticleCard({ a }: { a: ArticlePreview }) {
  const tag = a.tags[0]?.name
  return (
    <Link href={`/articles/${a.slug}`} className="ed-card group">
      {a.coverImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={a.coverImage} alt="" className="h-[150px] w-full object-cover" />
      ) : (
        <CoverArt label={tag} className="h-[150px]" />
      )}
      <div className="flex flex-1 flex-col p-5">
        {tag ? <div className="ed-eyebrow mb-2.5">{tag}</div> : null}
        <h3
          className="font-display mb-2.5 text-[21px] font-semibold leading-[1.18] transition-opacity group-hover:opacity-80"
          style={{ color: "var(--ed-ink)" }}
        >
          {a.title}
        </h3>
        <p className="font-reading mb-4 line-clamp-3 flex-1 text-[15px] leading-[1.5]" style={{ color: "var(--ed-muted)" }}>
          {a.excerpt}
        </p>
        <AuthorByline
          author={a.author}
          publishedAt={a.publishedAt}
          readingMinutes={a.readingMinutes}
          size={28}
          variant="compact"
          linkAuthor={false}
        />
      </div>
    </Link>
  )
}
