"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { currentUser, hasRole } from "@/lib/authz"
import { toSlug } from "@/lib/slug"

const articleInput = z.object({
  id: z.string().optional(),
  title: z.string().min(1, "Title is required").max(200),
  slug: z.string().optional(),
  excerpt: z.string().max(400).optional().default(""),
  body: z.string().default(""),
  coverImage: z.string().url().optional().or(z.literal("")).transform((v) => v || null),
  tags: z.array(z.string()).optional().default([]),
  featured: z.boolean().optional().default(false),
  // requested status after save
  status: z.enum(["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"]).default("DRAFT"),
})

export type ActionResult = { ok: true; slug: string; id: string } | { ok: false; error: string }

async function uniqueSlug(base: string, ignoreId?: string): Promise<string> {
  let slug = base || "article"
  let n = 1
  while (true) {
    const existing = await prisma.article.findUnique({ where: { slug } })
    if (!existing || existing.id === ignoreId) return slug
    n += 1
    slug = `${base}-${n}`
  }
}

export async function saveArticle(input: z.input<typeof articleInput>): Promise<ActionResult> {
  const user = await currentUser()
  if (!user) return { ok: false, error: "Not authenticated" }

  const parsed = articleInput.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }
  const data = parsed.data

  // Authors may not publish directly; only EDITOR+ can set PUBLISHED.
  let status = data.status
  if (status === "PUBLISHED" && !hasRole(user.role, "EDITOR")) {
    status = "REVIEW"
  }

  const tagConnect = data.tags
    .map((t) => ({ slug: toSlug(t), name: t.trim() }))
    .filter((t) => t.slug)
    .map((t) => ({
      where: { slug: t.slug },
      create: { slug: t.slug, name: t.name },
    }))

  if (data.id) {
    // Update existing — authors can only edit their own non-published drafts.
    const existing = await prisma.article.findUnique({ where: { id: data.id } })
    if (!existing) return { ok: false, error: "Article not found" }
    if (!hasRole(user.role, "EDITOR") && existing.authorId !== user.id) {
      return { ok: false, error: "You can only edit your own articles" }
    }

    const slugBase = data.slug ? toSlug(data.slug) : existing.slug
    const slug = await uniqueSlug(slugBase, existing.id)
    const becomingPublished = status === "PUBLISHED" && existing.status !== "PUBLISHED"

    const updated = await prisma.article.update({
      where: { id: existing.id },
      data: {
        title: data.title,
        slug,
        excerpt: data.excerpt,
        body: data.body,
        coverImage: data.coverImage,
        featured: data.featured,
        status,
        publishedAt: becomingPublished ? new Date() : existing.publishedAt,
        tags: { set: [], connectOrCreate: tagConnect },
        revisions: {
          create: { title: data.title, body: data.body, editorId: user.id },
        },
      },
    })
    revalidatePath("/")
    revalidatePath(`/article/${updated.slug}`)
    return { ok: true, slug: updated.slug, id: updated.id }
  }

  // Create new
  const slug = await uniqueSlug(toSlug(data.slug || data.title))
  const created = await prisma.article.create({
    data: {
      title: data.title,
      slug,
      excerpt: data.excerpt,
      body: data.body,
      coverImage: data.coverImage,
      featured: data.featured,
      status,
      publishedAt: status === "PUBLISHED" ? new Date() : null,
      authorId: user.id,
      tags: { connectOrCreate: tagConnect },
      revisions: {
        create: { title: data.title, body: data.body, editorId: user.id },
      },
    },
  })
  revalidatePath("/")
  revalidatePath(`/article/${created.slug}`)
  return { ok: true, slug: created.slug, id: created.id }
}

export async function deleteArticle(id: string): Promise<ActionResult> {
  const user = await currentUser()
  if (!user) return { ok: false, error: "Not authenticated" }
  const existing = await prisma.article.findUnique({ where: { id } })
  if (!existing) return { ok: false, error: "Article not found" }
  if (!hasRole(user.role, "EDITOR") && existing.authorId !== user.id) {
    return { ok: false, error: "Not allowed" }
  }
  await prisma.article.delete({ where: { id } })
  revalidatePath("/")
  revalidatePath(`/article/${existing.slug}`)
  return { ok: true, slug: existing.slug, id }
}

// Convenience wrapper used by the editor's "Save & publish" / redirect flow.
export async function saveAndReturn(input: z.input<typeof articleInput>) {
  const res = await saveArticle(input)
  if (res.ok) redirect("/admin")
  return res
}
