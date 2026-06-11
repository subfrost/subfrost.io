import { format } from "date-fns"
import type { AuthorProfile } from "@/lib/cms/articles"

export function Avatar({ name, src, size = 40 }: { name: string; src: string | null; size?: number }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size }} />
  }
  return (
    <div className="flex items-center justify-center rounded-full bg-zinc-200 font-medium text-zinc-600"
      style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {name[0]?.toUpperCase()}
    </div>
  )
}

export function AuthorByline({
  author, publishedAt, readingMinutes, size = 44,
}: {
  author: AuthorProfile
  publishedAt: string | null
  readingMinutes: number
  size?: number
}) {
  return (
    <div className="flex items-center gap-3">
      <Avatar name={author.name} src={author.avatarUrl} size={size} />
      <div className="text-sm">
        <div className="font-medium text-zinc-900">{author.name}</div>
        <div className="text-zinc-500">
          {publishedAt ? format(new Date(publishedAt), "MMM d, yyyy") : ""} · {readingMinutes} min read
        </div>
      </div>
    </div>
  )
}
