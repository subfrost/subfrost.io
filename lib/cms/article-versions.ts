// WS5 — lifecycle-aware article version helpers. Unlike the append-only
// `Revision` (kept as-is), an `ArticleVersion` carries a monotonic `number` per
// (articleId, locale) and a lifecycle `stage`, and is the anchor target for
// inline review comments. `bumpVersion` is wired into `upsertArticle` and only
// creates a new version when the title/body actually changed for that locale, or
// when the stage transitions.

import { Prisma } from "@prisma/client"
import type { ArticleVersion, Locale, ArticleVersionStage } from "@prisma/client"
import prisma from "@/lib/prisma"

/** A prisma instance OR a `$transaction` client — both expose `articleVersion`. */
type Db = Pick<typeof prisma, "articleVersion"> | Prisma.TransactionClient

/** Map an Article `status` string to the version lifecycle stage. Anything that
 *  isn't a live review/publish state snapshots as DRAFT. */
export function stageForStatus(status: string): ArticleVersionStage {
  if (status === "PUBLISHED") return "PUBLISHED"
  if (status === "REVIEW") return "REVIEW"
  return "DRAFT"
}

/** Latest (highest-numbered) version for a translation, or null. */
export async function latestVersion(
  articleId: string,
  locale: Locale,
  db: Db = prisma,
): Promise<ArticleVersion | null> {
  return db.articleVersion.findFirst({
    where: { articleId, locale },
    orderBy: { number: "desc" },
  })
}

/** All versions for a translation, newest first. */
export async function listVersions(articleId: string, locale: Locale): Promise<ArticleVersion[]> {
  return prisma.articleVersion.findMany({
    where: { articleId, locale },
    orderBy: { number: "desc" },
  })
}

export interface BumpInput {
  articleId: string
  locale: Locale
  title: string
  body: string
  stage: ArticleVersionStage
  editorId?: string | null
}

/** Create the next version for (articleId, locale) IF something meaningful
 *  changed — i.e. the title or body differs from the latest version, OR the
 *  stage transitioned. Returns the created version, or null when it was a no-op.
 *  Safe to call inside a `$transaction` by passing the tx client. */
export async function bumpVersion(input: BumpInput, db: Db = prisma): Promise<ArticleVersion | null> {
  const latest = await latestVersion(input.articleId, input.locale, db)
  const unchanged =
    latest &&
    latest.title === input.title &&
    latest.body === input.body &&
    latest.stage === input.stage
  if (unchanged) return null

  const number = (latest?.number ?? 0) + 1
  return db.articleVersion.create({
    data: {
      articleId: input.articleId,
      locale: input.locale,
      number,
      stage: input.stage,
      title: input.title,
      body: input.body,
      editorId: input.editorId ?? null,
    },
  })
}
