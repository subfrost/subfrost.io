"use server"

// WS5 — inline review comments + review timeline for the article preview. Anyone
// who passes the preview gate (the article's author OR `articles.publish`) may
// comment/resolve, mirroring app/admin/articles/[id]/preview/page.tsx. Follows
// the existing actions/cms pattern: currentUser() gate + revalidatePath.

import { revalidatePath } from "next/cache"
import type { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import { currentUser, type CmsUser } from "@/lib/cms/authz"
import type { TextAnchor } from "@/lib/cms/annotation-anchor"
import { listVersions as listVersionsLib } from "@/lib/cms/article-versions"

type Locale = "en" | "zh"

export interface CommentAuthor {
  id: string
  name: string
  avatarUrl: string | null
}

export interface CommentDTO {
  id: string
  articleId: string
  versionId: string | null
  locale: Locale
  author: CommentAuthor
  anchor: TextAnchor
  body: string
  status: "OPEN" | "RESOLVED" | "ORPHANED"
  parentId: string | null
  createdAt: string
  updatedAt: string
}

export interface VersionDTO {
  id: string
  number: number
  stage: "DRAFT" | "REVIEW" | "PUBLISHED"
  locale: Locale
  title: string
  editor: CommentAuthor | null
  createdAt: string
}

export type TimelineEntry =
  | ({ kind: "version"; at: string } & VersionDTO)
  | ({ kind: "comment"; at: string } & CommentDTO)

type ActionOk<T> = { ok: true } & T
type ActionErr = { ok: false; error: string }

/** The preview gate: author of the article, or holder of `articles.publish`. */
async function gate(articleId: string): Promise<{ user: CmsUser } | { error: string; status: number }> {
  const user = await currentUser()
  if (!user) return { error: "Not authenticated", status: 401 }
  const article = await prisma.article.findUnique({ where: { id: articleId }, select: { authorId: true } })
  if (!article) return { error: "Article not found", status: 404 }
  if (!user.privileges.includes("articles.publish") && article.authorId !== user.id) {
    return { error: "Not allowed", status: 403 }
  }
  return { user }
}

/** Resolve loose-ref user ids → display names (like other loose-ref models). */
async function resolveAuthors(ids: string[]): Promise<Map<string, CommentAuthor>> {
  const unique = Array.from(new Set(ids.filter(Boolean)))
  if (unique.length === 0) return new Map()
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true, email: true, avatarUrl: true },
  })
  return new Map(users.map((u) => [u.id, { id: u.id, name: u.name ?? u.email, avatarUrl: u.avatarUrl }]))
}

function unknownAuthor(id: string): CommentAuthor {
  return { id, name: "Unknown", avatarUrl: null }
}

function toCommentDTO(
  c: { id: string; articleId: string; versionId: string | null; locale: string; authorId: string; anchor: unknown; body: string; status: string; parentId: string | null; createdAt: Date; updatedAt: Date },
  authors: Map<string, CommentAuthor>,
): CommentDTO {
  return {
    id: c.id,
    articleId: c.articleId,
    versionId: c.versionId,
    locale: c.locale as Locale,
    author: authors.get(c.authorId) ?? unknownAuthor(c.authorId),
    anchor: c.anchor as TextAnchor,
    body: c.body,
    status: c.status as CommentDTO["status"],
    parentId: c.parentId,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }
}

export async function addComment(input: {
  articleId: string
  versionId?: string | null
  locale: Locale
  anchor: TextAnchor
  body: string
  parentId?: string | null
}): Promise<ActionOk<{ comment: CommentDTO }> | ActionErr> {
  const g = await gate(input.articleId)
  if ("error" in g) return { ok: false, error: g.error }
  const body = input.body.trim()
  if (!body) return { ok: false, error: "Comment cannot be empty" }

  const created = await prisma.articleComment.create({
    data: {
      articleId: input.articleId,
      versionId: input.versionId ?? null,
      locale: input.locale,
      authorId: g.user.id,
      anchor: input.anchor as unknown as Prisma.InputJsonValue,
      body,
      parentId: input.parentId ?? null,
    },
  })
  const authors = await resolveAuthors([created.authorId])
  revalidatePath(`/admin/articles/${input.articleId}/preview`)
  return { ok: true, comment: toCommentDTO(created, authors) }
}

async function setStatus(id: string, status: "OPEN" | "RESOLVED"): Promise<ActionOk<{ comment: CommentDTO }> | ActionErr> {
  const existing = await prisma.articleComment.findUnique({ where: { id }, select: { articleId: true } })
  if (!existing) return { ok: false, error: "Comment not found" }
  const g = await gate(existing.articleId)
  if ("error" in g) return { ok: false, error: g.error }
  const updated = await prisma.articleComment.update({ where: { id }, data: { status } })
  const authors = await resolveAuthors([updated.authorId])
  revalidatePath(`/admin/articles/${updated.articleId}/preview`)
  return { ok: true, comment: toCommentDTO(updated, authors) }
}

export async function resolveComment(id: string) {
  return setStatus(id, "RESOLVED")
}

export async function reopenComment(id: string) {
  return setStatus(id, "OPEN")
}

/** All comments for a translation (optionally scoped to one version), oldest
 *  first so threads read naturally. */
export async function listComments(
  articleId: string,
  locale: Locale,
  versionId?: string,
): Promise<CommentDTO[]> {
  const rows = await prisma.articleComment.findMany({
    where: { articleId, locale, ...(versionId ? { versionId } : {}) },
    orderBy: { createdAt: "asc" },
  })
  const authors = await resolveAuthors(rows.map((r) => r.authorId))
  return rows.map((r) => toCommentDTO(r, authors))
}

/** Versions for a translation as DTOs (with resolved editor names), newest
 *  first — for the preview's version chain + the v1 API. */
export async function listVersions(articleId: string, locale: Locale): Promise<VersionDTO[]> {
  const versions = await listVersionsLib(articleId, locale)
  const authors = await resolveAuthors(versions.map((v) => v.editorId ?? "").filter(Boolean))
  return versions.map((v) => ({
    id: v.id,
    number: v.number,
    stage: v.stage,
    locale: v.locale as Locale,
    title: v.title,
    editor: v.editorId ? authors.get(v.editorId) ?? unknownAuthor(v.editorId) : null,
    createdAt: v.createdAt.toISOString(),
  }))
}

/** Merged, chronological review audit log: version bumps interleaved with
 *  comments — the review/feedback/edit trail. */
export async function listReviewTimeline(articleId: string, locale: Locale): Promise<TimelineEntry[]> {
  const [versions, comments] = await Promise.all([
    listVersionsLib(articleId, locale),
    prisma.articleComment.findMany({ where: { articleId, locale }, orderBy: { createdAt: "asc" } }),
  ])
  const authors = await resolveAuthors([
    ...versions.map((v) => v.editorId ?? "").filter(Boolean),
    ...comments.map((c) => c.authorId),
  ])

  const versionEntries: TimelineEntry[] = versions.map((v) => ({
    kind: "version",
    at: v.createdAt.toISOString(),
    id: v.id,
    number: v.number,
    stage: v.stage,
    locale: v.locale as Locale,
    title: v.title,
    editor: v.editorId ? authors.get(v.editorId) ?? unknownAuthor(v.editorId) : null,
    createdAt: v.createdAt.toISOString(),
  }))
  const commentEntries: TimelineEntry[] = comments.map((c) => ({
    kind: "comment",
    at: c.createdAt.toISOString(),
    ...toCommentDTO(c, authors),
  }))

  return [...versionEntries, ...commentEntries].sort((a, b) => a.at.localeCompare(b.at))
}
