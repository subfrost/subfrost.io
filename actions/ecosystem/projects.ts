"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { currentUser } from "@/lib/cms/authz"
import { translate, translationUnavailable, type Locale } from "@/lib/cms/translate"
import {
  isValidCategory,
  isValidStatus,
  isValidHttpUrl,
  isValidOptionalHttpUrl,
  slugify,
} from "@/lib/ecosystem/constants"

export interface EcosystemProjectInput {
  id?: string
  name: string
  slug?: string
  logoUrl?: string | null
  category: string
  status: string
  url: string
  xUrl?: string | null
  docsUrl?: string | null
  descriptionEn: string
  descriptionZh: string
  featured: boolean
  sortOrder: number
  published: boolean
}

async function requireEdit(): Promise<string | null> {
  const user = await currentUser()
  if (!user) return "Not authenticated"
  if (!user.privileges.includes("ecosystem.edit")) return "Not allowed"
  return null
}

function revalidate() {
  revalidatePath("/ecosystem")
  revalidatePath("/admin/ecosystem")
}

function validate(input: EcosystemProjectInput): string | null {
  if (!input.name?.trim()) return "Name is required"
  if (!isValidCategory(input.category)) return "Unknown category"
  if (!isValidStatus(input.status)) return "Unknown status"
  if (!isValidHttpUrl(input.url)) return "Website must be a valid http(s) URL"
  if (!isValidOptionalHttpUrl(input.xUrl)) return "X link must be a valid http(s) URL"
  if (!isValidOptionalHttpUrl(input.docsUrl)) return "Docs link must be a valid http(s) URL"
  if (!isValidOptionalHttpUrl(input.logoUrl)) return "Logo must be a valid http(s) URL"
  return null
}

export async function saveEcosystemProject(
  input: EcosystemProjectInput
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const authErr = await requireEdit()
  if (authErr) return { ok: false, error: authErr }
  const err = validate(input)
  if (err) return { ok: false, error: err }

  const data = {
    name: input.name.trim(),
    logoUrl: input.logoUrl?.trim() || null,
    category: input.category,
    status: input.status,
    url: input.url.trim(),
    xUrl: input.xUrl?.trim() || null,
    docsUrl: input.docsUrl?.trim() || null,
    descriptionEn: input.descriptionEn.trim(),
    descriptionZh: input.descriptionZh.trim(),
    featured: input.featured,
    sortOrder: Number.isFinite(input.sortOrder) ? Math.trunc(input.sortOrder) : 0,
    published: input.published,
  }

  try {
    if (input.id) {
      const row = await prisma.ecosystemProject.update({ where: { id: input.id }, data })
      revalidate()
      return { ok: true, id: row.id }
    }
    const slug = slugify(input.slug?.trim() || input.name)
    if (!slug) return { ok: false, error: "Could not derive a slug from the name" }
    const row = await prisma.ecosystemProject.create({ data: { ...data, slug } })
    revalidate()
    return { ok: true, id: row.id }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Save failed"
    return { ok: false, error: msg.includes("Unique constraint") ? "Slug already exists" : msg }
  }
}

export async function deleteEcosystemProject(id: string): Promise<{ ok: boolean; error?: string }> {
  const authErr = await requireEdit()
  if (authErr) return { ok: false, error: authErr }
  try {
    await prisma.ecosystemProject.delete({ where: { id } })
    revalidate()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Delete failed" }
  }
}

export async function setFeaturedBandEnabled(enabled: boolean): Promise<{ ok: boolean; error?: string }> {
  const authErr = await requireEdit()
  if (authErr) return { ok: false, error: authErr }
  await prisma.ecosystemSettings.upsert({
    where: { id: 1 },
    update: { featuredBandEnabled: enabled },
    create: { id: 1, featuredBandEnabled: enabled },
  })
  revalidate()
  return { ok: true }
}

export async function translateEcosystemDescription(
  descriptionEn: string
): Promise<{ ok: boolean; zh?: string; error?: string }> {
  const authErr = await requireEdit()
  if (authErr) return { ok: false, error: authErr }
  if (!descriptionEn.trim()) return { ok: false, error: "Nothing to translate" }
  if (translationUnavailable()) return { ok: false, error: "Translation unavailable (no API key)" }
  // Reuse the article translator; only `body` carries content for a short blurb.
  const from: Locale = "en"
  const to: Locale = "zh"
  const out = await translate(
    { title: "", excerpt: "", body: descriptionEn.trim(), sources: "" },
    from,
    to
  )
  return { ok: true, zh: out.body.trim() }
}
