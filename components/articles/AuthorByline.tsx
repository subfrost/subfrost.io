import Link from "next/link"
import { Fragment, type CSSProperties } from "react"
import type { AuthorProfile, CmsLocale } from "@/lib/cms/articles"

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
// `variant="compact"` is a single muted line (used in cards); `reader` gives
// article headers a Medium-style author row without adding social UI. The default
// stacks the names over the date/read-time. `linkAuthor` is disabled inside
// card links to avoid nesting an <a> within an <a>. `coAuthors` (optional)
// extends the byline to "X and Y" and the avatar to a small overlapping stack.
export function AuthorByline({
  author,
  publishedAt,
  readingMinutes,
  size = 40,
  variant = "full",
  linkAuthor = true,
  locale = "en",
  coAuthors = [],
}: {
  author: AuthorProfile
  publishedAt: string | null
  readingMinutes: number
  size?: number
  variant?: "full" | "compact" | "reader"
  linkAuthor?: boolean
  locale?: CmsLocale
  coAuthors?: AuthorProfile[]
}) {
  const all = [author, ...coAuthors]
  const hrefFor = (a: AuthorProfile) => (locale === "zh" ? `/authors/${a.id}?lang=zh` : `/authors/${a.id}`)
  const sepBefore = (i: number) => {
    if (i === all.length - 1) return all.length > 2 && locale !== "zh" ? ", and " : locale === "zh" ? " 和 " : " and "
    return locale === "zh" ? "、" : ", "
  }
  const names = (
    <>
      {all.map((a, i) => (
        <Fragment key={a.id}>
          {i > 0 ? <span>{sepBefore(i)}</span> : null}
          {linkAuthor ? (
            <Link href={hrefFor(a)} className="font-medium hover:underline" style={{ color: "var(--ed-ink)" }}>
              {a.name}
            </Link>
          ) : (
            <span className="font-medium" style={{ color: "var(--ed-ink)" }}>
              {a.name}
            </span>
          )}
        </Fragment>
      ))}
    </>
  )

  if (variant === "compact") {
    const d = publishedAt
      ? new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric" }).format(new Date(publishedAt))
      : ""
    return (
      <div className="flex items-center gap-2.5">
        <Avatar name={author.name} src={author.avatarUrl} size={size} />
        <div className="font-reading text-[13px]" style={{ color: "var(--ed-muted)" }}>
          {names}
          {d ? ` · ${d}` : ""}
          {readingMinutes ? ` · ${readingMinutes} ${locale === "zh" ? "分钟" : "min"}` : ""}
        </div>
      </div>
    )
  }

  const dateStr = publishedAt
    ? new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(publishedAt))
    : ""

  if (variant === "reader") {
    return (
      <div className="font-reading flex flex-wrap items-center gap-x-3 gap-y-2 text-left text-[14px]">
        <div className="flex -space-x-2">
          {all.slice(0, 3).map((a) => (
            <span key={a.id} className="rounded-full ring-2" style={{ ["--tw-ring-color"]: "var(--ed-canvas)" } as CSSProperties}>
              <Avatar name={a.name} src={a.avatarUrl} size={size} />
            </span>
          ))}
        </div>
        <div className="leading-none">{names}</div>
        <div style={{ color: "var(--ed-muted)" }}>
          {readingMinutes ? `${readingMinutes} ${locale === "zh" ? "分钟阅读" : "min read"}` : ""}
          {readingMinutes && dateStr ? " · " : ""}
          {dateStr}
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex -space-x-2">
        {all.slice(0, 3).map((a) => (
          <span key={a.id} className="rounded-full ring-2" style={{ ["--tw-ring-color"]: "var(--ed-hair)" } as CSSProperties}>
            <Avatar name={a.name} src={a.avatarUrl} size={size} />
          </span>
        ))}
      </div>
      <div className="leading-tight">
        <div className="text-[15px]">{names}</div>
        <div className="font-reading text-[14px]" style={{ color: "var(--ed-muted)" }}>
          {dateStr}
          {readingMinutes ? ` · ${readingMinutes} ${locale === "zh" ? "分钟阅读" : "min read"}` : ""}
        </div>
      </div>
    </div>
  )
}
