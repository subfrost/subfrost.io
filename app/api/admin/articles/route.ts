import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import matter from "gray-matter"
import { actorFromBearer } from "@/lib/cms/apikey-auth"
import { upsertArticle, type ArticleInput } from "@/lib/cms/article-write"

export const runtime = "nodejs"

// Bearer-key article upload.
//
//   Authorization: Bearer sk_...
//
// Two body formats:
//   1. application/json  — { slug?, status?, featured?, primaryLocale?, tags?,
//                            coverImage?, translations: { en?:{title,excerpt,body}, zh?:{...} } }
//   2. text/markdown     — Markdown with YAML frontmatter:
//        ---
//        title: My title
//        locale: en           # en | zh
//        slug: my-title       # optional
//        excerpt: ...
//        tags: [frBTC, Research]
//        status: published    # draft|review|published
//        featured: true
//        coverImage: https://...
//        ---
//        # body markdown...
function normalizeStatus(s: unknown): ArticleInput["status"] {
  const v = String(s ?? "draft").toUpperCase()
  return (["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"].includes(v) ? v : "DRAFT") as ArticleInput["status"]
}

function fromMarkdown(raw: string): ArticleInput {
  const { data, content } = matter(raw)
  const locale = (String(data.locale ?? "en") === "zh" ? "zh" : "en") as "en" | "zh"
  const tags = Array.isArray(data.tags)
    ? data.tags.map(String)
    : typeof data.tags === "string"
      ? data.tags.split(",").map((s) => s.trim()).filter(Boolean)
      : []
  return {
    slug: data.slug ? String(data.slug) : undefined,
    status: normalizeStatus(data.status),
    featured: Boolean(data.featured),
    primaryLocale: locale,
    coverImage: data.coverImage ? String(data.coverImage) : "",
    tags,
    translations: {
      [locale]: {
        title: String(data.title ?? "").trim(),
        excerpt: String(data.excerpt ?? "").trim(),
        body: content.trim(),
      },
    },
  } as ArticleInput
}

export async function POST(req: NextRequest) {
  const actor = await actorFromBearer(req.headers.get("authorization"))
  if (!actor) return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 })

  const ctype = req.headers.get("content-type") || ""
  let input: ArticleInput
  try {
    if (ctype.includes("application/json")) {
      input = (await req.json()) as ArticleInput
    } else {
      input = fromMarkdown(await req.text())
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Bad request body" }, { status: 400 })
  }

  const res = await upsertArticle({ id: actor.id, role: actor.role }, input)
  if (!res.ok) return NextResponse.json(res, { status: 400 })

  revalidatePath("/")
  revalidatePath("/articles")
  revalidatePath(`/articles/${res.slug}`)
  return NextResponse.json({ ok: true, slug: res.slug, id: res.id, url: `/articles/${res.slug}` }, { status: 201 })
}
