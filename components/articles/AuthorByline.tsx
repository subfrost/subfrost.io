import { format } from "date-fns"
import Link from "next/link"
import type { AuthorProfile } from "@/lib/cms/articles"

export function Avatar({ name, src, size = 40 }: { name: string; src: string | null; size?: number }) {
  return (
    <span className="ed-avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} width={size} height={size} className="h-full w-full object-cover" />
      ) : (
        name[0]?.toUpperCase()
      )}
    </span>
  )
}

// Byline rendered under feed cards, the reader header, and author pages.
// `variant="compact"` is a single muted line (used in cards); the default
// stacks the name over the date/read-time. `linkAuthor` is disabled inside
// card links to avoid nesting an <a> within an <a>.
export function AuthorByline({
  author,
  publishedAt,
  readingMinutes,
  size = 40,
  variant = "full",
  linkAuthor = true,
}: {
  author: AuthorProfile
  publishedAt: string | null
  readingMinutes: number
  size?: number
  variant?: "full" | "compact"
  linkAuthor?: boolean
}) {
  const name = linkAuthor ? (
    <Link href={`/authors/${author.id}`} className="font-medium hover:underline" style={{ color: "var(--ed-ink)" }}>
      {author.name}
    </Link>
  ) : (
    <span className="font-medium" style={{ color: "var(--ed-ink)" }}>
      {author.name}
    </span>
  )

  if (variant === "compact") {
    const d = publishedAt ? format(new Date(publishedAt), "MMM d") : ""
    return (
      <div className="flex items-center gap-2.5">
        <Avatar name={author.name} src={author.avatarUrl} size={size} />
        <div className="font-reading text-[13px]" style={{ color: "var(--ed-muted)" }}>
          {name}
          {d ? ` · ${d}` : ""}
          {readingMinutes ? ` · ${readingMinutes} min` : ""}
        </div>
      </div>
    )
  }

  const dateStr = publishedAt ? format(new Date(publishedAt), "MMM d, yyyy") : ""
  return (
    <div className="flex items-center gap-3">
      <Avatar name={author.name} src={author.avatarUrl} size={size} />
      <div className="leading-tight">
        <div className="text-[15px]">{name}</div>
        <div className="font-reading text-[14px]" style={{ color: "var(--ed-muted)" }}>
          {dateStr}
          {readingMinutes ? ` · ${readingMinutes} min read` : ""}
        </div>
      </div>
    </div>
  )
}
