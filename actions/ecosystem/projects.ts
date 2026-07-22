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
  isValidKind,
  isValidOptionalAlkaneId,
  isValidAlkaneId,
  slugify,
} from "@/lib/ecosystem/constants"

export interface EcosystemContractInput {
  label: string
  alkaneId: string
  noteEn?: string
  noteZh?: string
}

export interface EcosystemProjectInput {
  id?: string
  name: string
  slug?: string
  logoUrl?: string | null
  bannerUrl?: string | null
  category: string
  status: string
  kind?: string
  alkaneId?: string | null
  url: string
  xUrl?: string | null
  docsUrl?: string | null
  descriptionEn: string
  descriptionZh: string
  featured: boolean
  inMosaic: boolean
  showMarketStats: boolean
  sortOrder: number
  published: boolean
  profileEn?: string
  profileZh?: string
  contracts?: EcosystemContractInput[]
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
  revalidatePath("/ecosystem/[slug]", "page")
}

function validate(input: EcosystemProjectInput): string | null {
  if (!input.name?.trim()) return "Name is required"
  if (!isValidCategory(input.category)) return "Unknown category"
  if (!isValidStatus(input.status)) return "Unknown status"
  const kind = input.kind ?? "App"
  if (!isValidKind(kind)) return "Unknown kind"
  if (!isValidOptionalAlkaneId(input.alkaneId?.trim())) {
    return "Alkane ID must look like block:tx (e.g. 2:0)"
  }
  if (!isValidHttpUrl(input.url)) return "Website must be a valid http(s) URL"
  if (!isValidOptionalHttpUrl(input.xUrl)) return "X link must be a valid http(s) URL"
  if (!isValidOptionalHttpUrl(input.docsUrl)) return "Docs link must be a valid http(s) URL"
  if (!isValidOptionalHttpUrl(input.logoUrl)) return "Logo must be a valid http(s) URL"
  if (!isValidOptionalHttpUrl(input.bannerUrl)) return "Banner must be a valid http(s) URL"
  for (const c of input.contracts ?? []) {
    if (!c.label?.trim()) return "Contract label is required"
    if (!isValidAlkaneId(c.alkaneId?.trim() ?? "")) {
      return "Contract Alkane ID must look like block:tx (e.g. 4:257)"
    }
  }
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
    bannerUrl: input.bannerUrl?.trim() || null,
    category: input.category,
    status: input.status,
    kind: input.kind ?? "App",
    alkaneId: input.alkaneId?.trim() || null,
    url: input.url.trim(),
    xUrl: input.xUrl?.trim() || null,
    docsUrl: input.docsUrl?.trim() || null,
    descriptionEn: input.descriptionEn.trim(),
    descriptionZh: input.descriptionZh.trim(),
    featured: input.featured,
    inMosaic: input.inMosaic,
    showMarketStats: input.showMarketStats,
    sortOrder: Number.isFinite(input.sortOrder) ? Math.trunc(input.sortOrder) : 0,
    published: input.published,
  }

  const base = {
    ...data,
    profileEn: input.profileEn?.trim() ?? "",
    profileZh: input.profileZh?.trim() ?? "",
  }
  const contractRows = input.contracts?.map((c, i) => ({
    label: c.label.trim(),
    alkaneId: c.alkaneId.trim(),
    noteEn: c.noteEn?.trim() ?? "",
    noteZh: c.noteZh?.trim() ?? "",
    sortOrder: i,
  }))

  try {
    if (input.id) {
      const row = await prisma.ecosystemProject.update({
        where: { id: input.id },
        data: contractRows
          ? { ...base, contracts: { deleteMany: {}, create: contractRows } }
          : base,
      })
      revalidate()
      return { ok: true, id: row.id }
    }
    const slug = slugify(input.slug?.trim() || input.name)
    if (!slug) return { ok: false, error: "Could not derive a slug from the name" }
    const row = await prisma.ecosystemProject.create({
      data: { ...base, slug, contracts: { create: contractRows ?? [] } },
    })
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
    console.error("deleteEcosystemProject failed", e)
    return { ok: false, error: "Delete failed" }
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

export async function translateEcosystemProfile(
  profileEn: string
): Promise<{ ok: boolean; zh?: string; error?: string }> {
  const authErr = await requireEdit()
  if (authErr) return { ok: false, error: authErr }
  if (!profileEn.trim()) return { ok: false, error: "Nothing to translate" }
  if (translationUnavailable()) return { ok: false, error: "Translation unavailable (no API key)" }
  // Same body-only path as the short description; the translator's system
  // prompt already preserves Markdown structure (headings, tables, code).
  const from: Locale = "en"
  const to: Locale = "zh"
  const out = await translate(
    { title: "", excerpt: "", body: profileEn.trim(), sources: "" },
    from,
    to
  )
  return { ok: true, zh: out.body.trim() }
}
