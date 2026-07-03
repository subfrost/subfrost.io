"use client"

import { FormEvent, useEffect, useMemo, useRef, useState } from "react"
import { ArrowUp } from "lucide-react"
import type { ArticlePreview, CmsLocale } from "@/lib/cms/articles"

type SearchItem = Pick<ArticlePreview, "slug" | "title" | "excerpt" | "tags" | "author" | "coAuthors">

export function ArticleSearchPrompt({ articles, locale }: { articles: SearchItem[]; locale: CmsLocale }) {
  const [query, setQuery] = useState("")
  const [message, setMessage] = useState("")
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const hasQuery = query.trim().length > 0
  const index = useMemo(
    () =>
      articles.map((article) => ({
        article,
        text: [
          article.title,
          article.excerpt,
          article.author.name,
          ...(article.coAuthors ?? []).map((c) => c.name),
          ...article.tags.flatMap((tag) => [tag.name, tag.slug]),
        ]
          .join(" ")
          .toLowerCase(),
      })),
    [articles],
  )

  useEffect(() => {
    function syncOpenState() {
      setOpen(window.location.hash === "#article-search")
    }

    syncOpenState()
    window.addEventListener("hashchange", syncOpenState)
    return () => window.removeEventListener("hashchange", syncOpenState)
  }, [])

  useEffect(() => {
    if (!open) return
    const id = window.setTimeout(() => inputRef.current?.focus(), 260)
    return () => window.clearTimeout(id)
  }, [open])

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalized = query.trim().toLowerCase()

    if (!normalized) {
      setMessage(locale === "zh" ? "输入一个主题来查找相关文章。" : "Enter a topic to find a related article.")
      return
    }

    const terms = normalized.split(/\s+/).filter(Boolean)
    const match = index
      .map((item) => ({
        article: item.article,
        score: terms.reduce((total, term) => total + (item.text.includes(term) ? 1 : 0), 0),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)[0]

    if (!match) {
      setMessage(locale === "zh" ? "没有找到匹配的文章。" : "No matching articles found.")
      return
    }

    const href = locale === "zh" ? `/articles/${match.article.slug}?lang=zh` : `/articles/${match.article.slug}`
    window.location.href = href
  }

  return (
    <section
      id="article-search"
      className={`fixed inset-x-0 bottom-0 top-[60px] z-40 px-6 transition-[opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] sm:px-8 ${
        open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
      }`}
      style={{ background: "var(--ed-canvas)" }}
      aria-hidden={!open}
    >
      <form
        onSubmit={onSubmit}
        className={`mx-auto mt-24 flex max-w-[680px] items-center gap-4 pb-3 transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] sm:mt-28 ${
          open ? "translate-y-0 opacity-100 delay-100" : "translate-y-4 opacity-0"
        }`}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            if (message) setMessage("")
          }}
          placeholder={locale === "zh" ? "搜索文章" : "Search articles"}
          aria-label={locale === "zh" ? "搜索文章" : "Search articles"}
          className="font-display min-w-0 flex-1 bg-transparent text-[24px] font-normal leading-none outline-none placeholder:text-black/42 sm:text-[28px]"
          style={{ color: "var(--ed-ink)" }}
        />
        <button
          type="submit"
          aria-label={locale === "zh" ? "搜索文章" : "Search articles"}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-80"
          style={{
            background: hasQuery ? "var(--ed-action-bg)" : "color-mix(in srgb, var(--ed-ink) 42%, transparent)",
            color: hasQuery ? "var(--ed-action-fg)" : "var(--ed-canvas)",
          }}
        >
          <ArrowUp className="h-4 w-4" strokeWidth={2.4} />
        </button>
      </form>
      {message ? (
        <p className="font-display mx-auto mt-3 max-w-[680px] text-[14px]" style={{ color: "var(--ed-muted)" }}>
          {message}
        </p>
      ) : null}
    </section>
  )
}
