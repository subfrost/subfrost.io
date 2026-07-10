"use server"

import { revalidatePath } from "next/cache"
import prisma from "@/lib/prisma"
import { currentUser } from "@/lib/cms/authz"
import { translate, translationUnavailable } from "@/lib/cms/translate"

export interface SetNoticeInput {
  enabled: boolean
  showBanner: boolean
  showModal: boolean
  titleEn: string
  messageEn: string
  titleZh: string
  messageZh: string
}

export async function setSystemNotice(input: SetNoticeInput): Promise<{ ok: boolean; error?: string }> {
  const user = await currentUser()
  if (!user) return { ok: false, error: "Not authenticated" }
  if (!user.privileges.includes("system.edit")) return { ok: false, error: "Not allowed" }

  const data = {
    enabled: input.enabled,
    showBanner: input.showBanner,
    showModal: input.showModal,
    titleEn: input.titleEn.trim() || null,
    messageEn: input.messageEn.trim() || null,
    titleZh: input.titleZh.trim() || null,
    messageZh: input.messageZh.trim() || null,
    updatedBy: user.id,
  }
  await prisma.systemNotice.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } })
  revalidatePath("/admin/notice")
  return { ok: true }
}

export async function translateNoticeAction(
  input: { titleEn: string; messageEn: string },
): Promise<{ ok: true; titleZh: string; messageZh: string } | { ok: false; error: string; unavailable?: boolean }> {
  const user = await currentUser()
  if (!user) return { ok: false, error: "Not authenticated" }
  if (!user.privileges.includes("system.edit")) return { ok: false, error: "Not allowed" }
  if (translationUnavailable()) return { ok: false, error: "Translation service not configured", unavailable: true }
  if (!input.titleEn.trim() && !input.messageEn.trim()) return { ok: false, error: "Nothing to translate" }
  try {
    const out = await translate({ title: input.titleEn, excerpt: "", body: input.messageEn, sources: "" }, "en", "zh")
    return { ok: true, titleZh: out.title.trim(), messageZh: out.body.trim() }
  } catch {
    return { ok: false, error: "Translation failed" }
  }
}
