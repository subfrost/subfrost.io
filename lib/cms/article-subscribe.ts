import prisma from "@/lib/prisma"

type Locale = "en" | "zh"

/** Global "notify me of any new article" subscription (anonymous email, single opt-in). */
export async function subscribeGlobal(email: string, locale: Locale, source: string): Promise<{ id: string }> {
  const e = email.trim().toLowerCase()
  const saved = await prisma.articleSubscriber.upsert({
    where: { email: e },
    create: { email: e, locale, source, active: true },
    update: { locale, source, active: true },
    select: { id: true },
  })
  return { id: saved.id }
}

/** Per-author "follow" subscription. Idempotent on (email, author); reactivates. */
export async function followAuthor(
  email: string, authorId: string, locale: Locale,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const e = email.trim().toLowerCase()
  const author = await prisma.user.findUnique({ where: { id: authorId }, select: { id: true } })
  if (!author) return { ok: false, error: "Unknown author" }
  await prisma.authorSubscription.upsert({
    where: { email_authorId: { email: e, authorId } },
    create: { email: e, authorId, locale, active: true },
    update: { locale, active: true },
    select: { id: true },
  })
  return { ok: true }
}

/** Deactivate the subscription that owns this unsubscribe token (global first, then author).
 *  Idempotent: an unknown token yields { unsubscribed: false, kind: null }. */
export async function unsubscribeByToken(
  token: string,
): Promise<{ unsubscribed: boolean; kind: "global" | "author" | null }> {
  try {
    await prisma.articleSubscriber.update({ where: { unsubscribeToken: token }, data: { active: false } })
    return { unsubscribed: true, kind: "global" }
  } catch {
    // not a global token — try author
  }
  try {
    await prisma.authorSubscription.update({ where: { unsubscribeToken: token }, data: { active: false } })
    return { unsubscribed: true, kind: "author" }
  } catch {
    return { unsubscribed: false, kind: null }
  }
}
