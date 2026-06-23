"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { currentUser, type CmsUser } from "@/lib/cms/authz"
import { audit } from "@/lib/cms/audit"
import { envelopes, esign, EsignError, type EsignActor } from "@/lib/esign/store"
import { documenso } from "@/lib/esign/documenso"
import {
  EnvelopeCreateSchema,
  type EnvelopeKind,
  type EnvelopeRecord,
  type RecipientInput,
  type Field,
  type TemplateRecord,
  type EnvelopeFromTemplateInput,
} from "@/lib/esign/types"

const DOCS_READ = "documents.read"
const DOCS_WRITE = "documents.write"
const PATH = "/admin/documents"

async function ip(): Promise<string | null> {
  const h = await headers()
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null
}

async function gate(
  need: "read" | "write",
): Promise<{ ok: true; me: CmsUser } | { ok: false; error: "unauthorized" }> {
  const me = await currentUser()
  const required = need === "write" ? DOCS_WRITE : DOCS_READ
  if (!me || !me.privileges.includes(required)) return { ok: false, error: "unauthorized" }
  return { ok: true, me }
}

function actorOf(me: CmsUser): EsignActor {
  return { id: me.id, email: me.email }
}

export type MutResult<T> = { ok: true; value: T } | { ok: false; error: string }

export interface DocumentsOverview {
  envelopes: EnvelopeRecord[]
  templates: TemplateRecord[]
  documensoLive: boolean
}
export type DocumentsOverviewResult =
  | { ok: true; overview: DocumentsOverview }
  | { ok: false; error: "unauthorized" }

export async function documentsOverviewAction(): Promise<DocumentsOverviewResult> {
  const g = await gate("read")
  if (!g.ok) return g
  // Templates are best-effort: a Documenso outage must not blank the inbox.
  let templates: TemplateRecord[] = []
  try {
    templates = await documenso.listTemplates()
  } catch {
    templates = []
  }
  const list = await envelopes.list()
  return {
    ok: true,
    overview: { envelopes: list, templates, documensoLive: list.length >= 0 && hasCreds() },
  }
}

function hasCreds(): boolean {
  // Re-read at call time; mirrors lib/esign/documenso.hasDocumensoCreds without
  // importing node-only branches into the client bundle.
  return Boolean((process.env.DOCUMENSO_API_URL ?? "").trim() && (process.env.DOCUMENSO_API_KEY ?? "").trim())
}

export type GetDocumentResult =
  | { ok: true; envelope: EnvelopeRecord }
  | { ok: false; error: "unauthorized" | "not_found" }

export async function getDocumentAction(id: string): Promise<GetDocumentResult> {
  const g = await gate("read")
  if (!g.ok) return g
  const env = await envelopes.get(id)
  if (!env) return { ok: false, error: "not_found" }
  return { ok: true, envelope: env }
}

export async function createDocumentAction(input: {
  kind: EnvelopeKind
  subject: string
  message?: string
  recipients: RecipientInput[]
  fields?: Field[]
  signingOrderEnabled?: boolean
  expiresAt?: string
  payeeId?: string | null
}): Promise<MutResult<{ id: string }>> {
  const g = await gate("write")
  if (!g.ok) return { ok: false, error: "unauthorized" }
  // Validate via the shared schema (recipient uniqueness, field bounds, signing
  // order contiguity, future expiry, …). sendNow is ignored here — the client
  // uploads the PDF then calls sendDocumentAction explicitly.
  const parsed = EnvelopeCreateSchema.safeParse({ ...input, sendNow: false })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid envelope" }
  }
  try {
    const env = await envelopes.create({
      kind: parsed.data.kind,
      subject: parsed.data.subject,
      message: parsed.data.message,
      recipients: parsed.data.recipients,
      fields: parsed.data.fields,
      signingOrderEnabled: parsed.data.signingOrderEnabled,
      expiresAt: parsed.data.expiresAt,
      createdBy: g.me.email,
      payeeId: input.payeeId ?? null,
    })
    await audit("document_create", { actorId: g.me.id, target: env.id, ip: await ip(), details: { subject: env.subject, kind: env.kind } })
    revalidatePath(PATH)
    return { ok: true, value: { id: env.id } }
  } catch (e) {
    if (e instanceof EsignError) return { ok: false, error: e.message }
    throw e
  }
}

export async function sendDocumentAction(id: string): Promise<MutResult<EnvelopeRecord>> {
  const g = await gate("write")
  if (!g.ok) return { ok: false, error: "unauthorized" }
  try {
    const env = await esign.send(id)
    await audit("document_send", { actorId: g.me.id, target: id, ip: await ip() })
    revalidatePath(PATH)
    revalidatePath(`${PATH}/${id}`)
    return { ok: true, value: env }
  } catch (e) {
    if (e instanceof EsignError) return { ok: false, error: e.message }
    return { ok: false, error: e instanceof Error ? e.message : "Send failed" }
  }
}

export async function voidDocumentAction(id: string, reason?: string): Promise<MutResult<EnvelopeRecord>> {
  const g = await gate("write")
  if (!g.ok) return { ok: false, error: "unauthorized" }
  try {
    const env = await envelopes.void(id, { reason: reason?.trim() || undefined })
    if (!env) return { ok: false, error: "Envelope not found" }
    await audit("document_void", { actorId: g.me.id, target: id, ip: await ip(), details: reason ? { reason } : undefined })
    revalidatePath(PATH)
    revalidatePath(`${PATH}/${id}`)
    return { ok: true, value: env }
  } catch (e) {
    if (e instanceof EsignError) return { ok: false, error: e.message }
    throw e
  }
}

export async function resendDocumentAction(
  id: string,
  recipientEmails?: string[],
): Promise<MutResult<EnvelopeRecord>> {
  const g = await gate("write")
  if (!g.ok) return { ok: false, error: "unauthorized" }
  try {
    const env = await envelopes.resend(id, { recipientEmails })
    if (!env) return { ok: false, error: "Envelope not found" }
    await audit("document_resend", { actorId: g.me.id, target: id, ip: await ip() })
    revalidatePath(`${PATH}/${id}`)
    return { ok: true, value: env }
  } catch (e) {
    if (e instanceof EsignError) return { ok: false, error: e.message }
    throw e
  }
}

export async function refreshDocumentAction(id: string): Promise<MutResult<EnvelopeRecord>> {
  const g = await gate("read")
  if (!g.ok) return { ok: false, error: "unauthorized" }
  try {
    const env = await esign.refresh(id)
    revalidatePath(`${PATH}/${id}`)
    return { ok: true, value: env }
  } catch (e) {
    if (e instanceof EsignError) return { ok: false, error: e.message }
    return { ok: false, error: e instanceof Error ? e.message : "Refresh failed" }
  }
}

export async function createFromTemplateAction(
  input: EnvelopeFromTemplateInput,
  payeeId?: string | null,
): Promise<MutResult<EnvelopeRecord>> {
  const g = await gate("write")
  if (!g.ok) return { ok: false, error: "unauthorized" }
  try {
    const env = await esign.createFromTemplate(input, actorOf(g.me), { payeeId: payeeId ?? null })
    await audit("document_create", { actorId: g.me.id, target: env.id, ip: await ip(), details: { subject: env.subject, template: input.templateId } })
    await audit("document_send", { actorId: g.me.id, target: env.id, ip: await ip() })
    revalidatePath(PATH)
    return { ok: true, value: env }
  } catch (e) {
    if (e instanceof EsignError) return { ok: false, error: e.message }
    return { ok: false, error: e instanceof Error ? e.message : "Template send failed" }
  }
}

export type ListTemplatesResult =
  | { ok: true; templates: TemplateRecord[] }
  | { ok: false; error: string }

export async function listTemplatesAction(): Promise<ListTemplatesResult> {
  const g = await gate("read")
  if (!g.ok) return { ok: false, error: "unauthorized" }
  try {
    return { ok: true, templates: await documenso.listTemplates() }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not load templates" }
  }
}

export async function attachToPayeeAction(
  id: string,
  payeeId: string | null,
): Promise<MutResult<EnvelopeRecord>> {
  const g = await gate("write")
  if (!g.ok) return { ok: false, error: "unauthorized" }
  try {
    const env = await envelopes.attachToPayee(id, payeeId)
    await audit("document_attach_payee", { actorId: g.me.id, target: id, ip: await ip(), details: payeeId ? { payeeId } : { payeeId: null } })
    revalidatePath(`${PATH}/${id}`)
    if (payeeId) revalidatePath(`/admin/financials/payees/${payeeId}`)
    return { ok: true, value: env }
  } catch (e) {
    if (e instanceof EsignError) return { ok: false, error: e.message }
    throw e
  }
}
