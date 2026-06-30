"use server"

import { revalidatePath } from "next/cache"
import prisma from "@/lib/prisma"
import { currentUser } from "@/lib/cms/authz"
import type { PushChannel, PushStatus, PushFrequency } from "@prisma/client"
import { Prisma } from "@prisma/client"
import type { PushMetrics } from "@/lib/cms/marketing-analytics"

export type PushActionResult = { ok: true; id: string } | { ok: false; error: string }

export interface PushInput {
  id?: string
  title: string
  channel: PushChannel
  status: PushStatus
  scheduledFor?: string | null
  publishedAt?: string | null
  articleId?: string | null
  refUrl?: string | null
  notes?: string | null
  metrics?: PushMetrics | null
  screenshotUrl?: string | null
}

export interface RecurrenceInput {
  id?: string
  title: string
  channel: PushChannel
  frequency: PushFrequency
  dayOfWeek: number
  dayOfMonth?: number | null
  active: boolean
  defaultNotes?: string | null
  startDate: string
  endDate?: string | null
}

const PRIV = "marketing.view"
const toDate = (s?: string | null) => (s ? new Date(s) : null)

function revalidate() {
  revalidatePath("/admin/marketing/schedule")
  revalidatePath("/feed.xml")
}

export async function savePush(input: PushInput): Promise<PushActionResult> {
  const user = await currentUser()
  if (!user) return { ok: false, error: "Not authenticated" }
  if (!user.privileges.includes(PRIV)) return { ok: false, error: "Not allowed" }
  if (!input.title.trim()) return { ok: false, error: "Title is required" }

  const data = {
    title: input.title.trim(),
    channel: input.channel,
    status: input.status,
    scheduledFor: toDate(input.scheduledFor),
    publishedAt: toDate(input.publishedAt),
    articleId: input.articleId || null,
    refUrl: input.refUrl || null,
    notes: input.notes || null,
    metrics: input.metrics != null ? (input.metrics as unknown as Prisma.InputJsonValue) : undefined,
    screenshotUrl: input.screenshotUrl || null,
  }

  const row = input.id
    ? await prisma.marketingPush.update({ where: { id: input.id }, data })
    : await prisma.marketingPush.create({ data: { ...data, createdById: user.id } })
  revalidate()
  return { ok: true, id: row.id }
}

export async function deletePush(id: string): Promise<PushActionResult> {
  const user = await currentUser()
  if (!user || !user.privileges.includes(PRIV)) return { ok: false, error: "Not allowed" }
  await prisma.marketingPush.delete({ where: { id } })
  revalidate()
  return { ok: true, id }
}

export async function saveRecurrence(input: RecurrenceInput): Promise<PushActionResult> {
  const user = await currentUser()
  if (!user || !user.privileges.includes(PRIV)) return { ok: false, error: "Not allowed" }
  const data = {
    title: input.title.trim(),
    channel: input.channel,
    frequency: input.frequency,
    dayOfWeek: input.dayOfWeek,
    dayOfMonth: input.dayOfMonth ?? null,
    active: input.active,
    defaultNotes: input.defaultNotes || null,
    startDate: new Date(input.startDate),
    endDate: toDate(input.endDate),
  }
  const row = input.id
    ? await prisma.recurringPush.update({ where: { id: input.id }, data })
    : await prisma.recurringPush.create({ data: { ...data, createdById: user.id } })
  revalidate()
  return { ok: true, id: row.id }
}

export async function deleteRecurrence(id: string): Promise<PushActionResult> {
  const user = await currentUser()
  if (!user || !user.privileges.includes(PRIV)) return { ok: false, error: "Not allowed" }
  await prisma.recurringPush.delete({ where: { id } })
  revalidate()
  return { ok: true, id }
}

/** Idempotent: returns the existing instance for (ruleId, date) or creates one. */
export async function materializeRecurrence(ruleId: string, occurrenceDateISO: string): Promise<PushActionResult> {
  const user = await currentUser()
  if (!user || !user.privileges.includes(PRIV)) return { ok: false, error: "Not allowed" }
  const rule = await prisma.recurringPush.findUnique({ where: { id: ruleId } })
  if (!rule) return { ok: false, error: "Rule not found" }
  const recurrenceDate = new Date(`${occurrenceDateISO.slice(0, 10)}T00:00:00.000Z`)

  const existing = await prisma.marketingPush.findUnique({
    where: { recurrenceId_recurrenceDate: { recurrenceId: ruleId, recurrenceDate } },
  })
  if (existing) return { ok: true, id: existing.id }

  const row = await prisma.marketingPush.create({
    data: {
      title: rule.title,
      channel: rule.channel,
      status: "SCHEDULED",
      scheduledFor: recurrenceDate,
      notes: rule.defaultNotes,
      recurrenceId: ruleId,
      recurrenceDate,
      createdById: user.id,
    },
  })
  revalidate()
  return { ok: true, id: row.id }
}
