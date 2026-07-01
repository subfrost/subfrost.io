// E-sign envelope CRUD + state machine — Prisma-backed.
//
// Ported from subfrost-admin's lib/esign.ts. The pure state-machine helpers
// (recomputeEnvelopeStatus, pickTriggeringRecipient, webhook dedup, …) are
// carried over verbatim; persistence is re-targeted from the JSON file store
// to Prisma (model Envelope) and PDF bytes from the data PVC to GCS
// (lib/cms/gcs.ts, private objects served only through a gated route).
//
// Server-only. Reached through the gated actions in actions/cms/documents.ts
// and the webhook route at app/api/webhooks/documenso. Domain violations throw
// EsignError; the action layer maps those to { ok:false, error } and never 500s.

import crypto from "node:crypto"
import { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import { audit } from "@/lib/cms/audit"
import { uploadDocumentPdf, downloadObject, objectExists } from "@/lib/cms/gcs"
import {
  documenso,
  hasDocumensoCreds,
  mapDocumensoStatusToEnvelopeStatus,
} from "./documenso"
import {
  EnvelopeFromTemplateSchema,
  MAX_APPLIED_EVENT_IDS,
  isSigningRole,
  type DocumensoEvent,
  type DocumentAttachment,
  type EnvelopeFromTemplateInput,
  type EnvelopeKind,
  type EnvelopeRecord,
  type EnvelopeStatus,
  type Field,
  type Recipient,
  type RecipientInput,
  type SignatureEventRecord,
  type SignatureEventKindT,
  type TimelineRow,
} from "./types"
import { extractTlsForensics, type TlsForensics } from "@/lib/telemetry/access-event"

export class EsignError extends Error {}

// Identity passed to user-driven lifecycle calls so the row records who acted.
export interface EsignActor {
  id: string | null
  email: string
}

// A read-scope descriptor. When `canViewAll` is false the list is narrowed to
// envelopes the viewer created (documents.view_all gates the see-all scope).
export interface EsignViewer {
  email: string
  canViewAll: boolean
}

// ---------- Signing-proxy token ---------------------------------------
//
// We wrap each recipient's Documenso signingUrl behind /sign/<token> on our
// own domain so the tlsd ingress injects the signer's TLS fingerprint headers
// before we 302 them onward. Token = base64url("<envelopeId>:<recipientEmail>").
// Not a secret — it only names which recipient viewed; the redirect target is
// still the unguessable Documenso signing URL.

export function encodeSigningToken(envelopeId: string, recipientEmail: string): string {
  return Buffer.from(`${envelopeId}:${recipientEmail}`, "utf8").toString("base64url")
}

export function decodeSigningToken(
  token: string,
): { envelopeId: string; recipientEmail: string } | null {
  let decoded: string
  try {
    decoded = Buffer.from(token, "base64url").toString("utf8")
  } catch {
    return null
  }
  const idx = decoded.indexOf(":")
  if (idx <= 0 || idx === decoded.length - 1) return null
  return { envelopeId: decoded.slice(0, idx), recipientEmail: decoded.slice(idx + 1) }
}

/** The wrapped signing link to hand a recipient (records forensics, then
 *  redirects to their Documenso signingUrl). */
export function signingProxyUrl(envelopeId: string, recipientEmail: string): string {
  return `/sign/${encodeSigningToken(envelopeId, recipientEmail)}`
}

// ---------- Row ⇄ record mapping -------------------------------------

type EnvelopeRow = Prisma.EnvelopeGetPayload<{}>

function mapRow(r: EnvelopeRow): EnvelopeRecord {
  return {
    id: r.id,
    kind: r.kind as EnvelopeKind,
    subject: r.subject,
    message: r.message ?? undefined,
    recipients: (r.recipients as unknown as Recipient[]) ?? [],
    attachment: (r.attachment as unknown as DocumentAttachment) ?? undefined,
    status: r.status as EnvelopeStatus,
    externalDocumentId: r.externalDocumentId ?? undefined,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    createdBy: r.createdBy,
    sentAt: r.sentAt?.toISOString(),
    completedAt: r.completedAt?.toISOString(),
    voidedAt: r.voidedAt?.toISOString(),
    voidReason: r.voidReason ?? undefined,
    expiresAt: r.expiresAt?.toISOString(),
    lastResendAt: r.lastResendAt?.toISOString(),
    signedDocumentPath: r.signedDocumentObject ?? undefined,
    notes: r.notes ?? undefined,
    payeeId: r.payeeId ?? null,
    sourceFileId: r.sourceFileId ?? null,
    entityId: r.entityId ?? null,
    agreementKey: r.agreementKey ?? null,
    version: r.version,
    parentEnvelopeId: r.parentEnvelopeId ?? null,
    fields: (r.fields as unknown as Field[] | null) ?? undefined,
    signingOrderEnabled: r.signingOrderEnabled,
    fieldsAppliedAt: r.fieldsAppliedAt?.toISOString(),
    fieldsAppliedCount: r.fieldsAppliedCount,
    appliedEventIds: r.appliedEventIds,
  }
}

type SignatureEventRow = Prisma.SignatureEventGetPayload<{}>

function mapSignatureEvent(r: SignatureEventRow): SignatureEventRecord {
  return {
    id: r.id,
    envelopeId: r.envelopeId,
    recipientEmail: r.recipientEmail,
    kind: r.kind as SignatureEventKindT,
    ip: r.ip ?? null,
    userAgent: r.userAgent ?? null,
    ja3: r.ja3 ?? null,
    ja4: r.ja4 ?? null,
    createdAt: r.createdAt.toISOString(),
  }
}

// Writable subset of the record, with ISO-string dates. Translated to Prisma
// data (Date objects, Json columns) in persist().
interface EnvelopePatch {
  status?: EnvelopeStatus
  externalDocumentId?: string
  recipients?: Recipient[]
  attachment?: DocumentAttachment
  fields?: Field[]
  signedDocumentObject?: string | null
  sentAt?: string
  completedAt?: string
  voidedAt?: string
  voidReason?: string
  lastResendAt?: string
  fieldsAppliedAt?: string
  fieldsAppliedCount?: number
  appliedEventIds?: string[]
  agreementKey?: string
  version?: number
  parentEnvelopeId?: string
  sourceFileId?: string | null
  entityId?: string | null
}

function toData(patch: EnvelopePatch): Prisma.EnvelopeUncheckedUpdateInput {
  const d: Prisma.EnvelopeUncheckedUpdateInput = { updatedAt: new Date() }
  if (patch.status !== undefined) d.status = patch.status
  if (patch.externalDocumentId !== undefined) d.externalDocumentId = patch.externalDocumentId
  if (patch.recipients !== undefined) d.recipients = patch.recipients as unknown as Prisma.InputJsonValue
  if (patch.attachment !== undefined) d.attachment = patch.attachment as unknown as Prisma.InputJsonValue
  if (patch.fields !== undefined) d.fields = patch.fields as unknown as Prisma.InputJsonValue
  if (patch.signedDocumentObject !== undefined) d.signedDocumentObject = patch.signedDocumentObject
  if (patch.sentAt !== undefined) d.sentAt = new Date(patch.sentAt)
  if (patch.completedAt !== undefined) d.completedAt = new Date(patch.completedAt)
  if (patch.voidedAt !== undefined) d.voidedAt = new Date(patch.voidedAt)
  if (patch.voidReason !== undefined) d.voidReason = patch.voidReason
  if (patch.lastResendAt !== undefined) d.lastResendAt = new Date(patch.lastResendAt)
  if (patch.fieldsAppliedAt !== undefined) d.fieldsAppliedAt = new Date(patch.fieldsAppliedAt)
  if (patch.fieldsAppliedCount !== undefined) d.fieldsAppliedCount = patch.fieldsAppliedCount
  if (patch.appliedEventIds !== undefined) d.appliedEventIds = patch.appliedEventIds
  if (patch.agreementKey !== undefined) d.agreementKey = patch.agreementKey
  if (patch.version !== undefined) d.version = patch.version
  if (patch.parentEnvelopeId !== undefined) d.parentEnvelopeId = patch.parentEnvelopeId
  if (patch.sourceFileId !== undefined) d.sourceFileId = patch.sourceFileId
  if (patch.entityId !== undefined) d.entityId = patch.entityId
  return d
}

async function persist(id: string, patch: EnvelopePatch): Promise<EnvelopeRecord> {
  const row = await prisma.envelope.update({ where: { id }, data: toData(patch) })
  return mapRow(row)
}

// GCS object names for an envelope's PDFs.
function sourceObject(id: string): string {
  return `documents/${id}.pdf`
}
function signedObject(id: string): string {
  return `documents/${id}-signed.pdf`
}

// ---------- State machine (verbatim from source) ---------------------

const TERMINAL_STATUSES: ReadonlySet<EnvelopeStatus> = new Set([
  "completed",
  "voided",
  "expired",
  "declined",
])

export function isTerminalStatus(s: EnvelopeStatus): boolean {
  return TERMINAL_STATUSES.has(s)
}

export function recomputeEnvelopeStatus(rec: EnvelopeRecord): EnvelopeStatus {
  if (isTerminalStatus(rec.status)) return rec.status
  const recipients = rec.recipients ?? []
  if (recipients.length === 0) return rec.status
  if (recipients.some((r) => r.status === "declined")) return "declined"
  const signers = recipients.filter((r) => isSigningRole(r.role))
  if (signers.length === 0) return rec.status
  const signed = signers.filter((r) => r.status === "signed").length
  if (signed === signers.length) return "completed"
  if (signed > 0) return "partially-signed"
  if (recipients.some((r) => r.status === "viewed")) return "viewed"
  return rec.status
}

function applyRecipientUpdate(
  rec: EnvelopeRecord,
  email: string,
  patch: Partial<Recipient>,
): EnvelopeRecord {
  const recipients = rec.recipients.map((r) =>
    r.email.toLowerCase() === email.toLowerCase() ? { ...r, ...patch } : r,
  )
  return { ...rec, recipients }
}

// ---------- envelopes (CRUD) -----------------------------------------

export const envelopes = {
  async list(
    filters: { payeeId?: string } = {},
    viewer?: EsignViewer,
  ): Promise<EnvelopeRecord[]> {
    const where: Prisma.EnvelopeWhereInput = {}
    if (filters.payeeId) where.payeeId = filters.payeeId
    // Read-scope: viewers without documents.view_all only see what they created.
    if (viewer && !viewer.canViewAll) where.createdBy = viewer.email
    const rows = await prisma.envelope.findMany({
      where,
      orderBy: { createdAt: "desc" },
    })
    return rows.map(mapRow)
  },

  async get(id: string): Promise<EnvelopeRecord | undefined> {
    const row = await prisma.envelope.findUnique({ where: { id } })
    return row ? mapRow(row) : undefined
  },

  async create(input: {
    kind: EnvelopeKind
    subject: string
    message?: string
    recipients: RecipientInput[]
    createdBy: string
    payeeId?: string | null
    expiresAt?: string
    fields?: Field[]
    signingOrderEnabled?: boolean
    sourceFileId?: string | null
    entityId?: string | null
    // Versioning: supplied by reissue(); left blank on a first envelope, in
    // which case agreementKey defaults to the row's own id (version 1).
    agreementKey?: string | null
    version?: number
    parentEnvelopeId?: string | null
  }): Promise<EnvelopeRecord> {
    const recipients: Recipient[] = input.recipients.map((r) => ({
      name: r.name,
      email: r.email,
      role: r.role,
      signingOrder: r.signingOrder,
      status: "pending",
    }))
    const row = await prisma.envelope.create({
      data: {
        kind: input.kind,
        subject: input.subject,
        message: input.message ?? null,
        recipients: recipients as unknown as Prisma.InputJsonValue,
        status: "draft",
        createdBy: input.createdBy,
        payeeId: input.payeeId ?? null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        fields:
          input.fields && input.fields.length > 0
            ? (input.fields as unknown as Prisma.InputJsonValue)
            : Prisma.DbNull,
        signingOrderEnabled: input.signingOrderEnabled ?? false,
        sourceFileId: input.sourceFileId ?? null,
        entityId: input.entityId ?? null,
        agreementKey: input.agreementKey ?? null,
        version: input.version ?? 1,
        parentEnvelopeId: input.parentEnvelopeId ?? null,
      },
    })
    // First envelope of an agreement: stamp agreementKey to its own id so all
    // future reissues share a stable group id.
    if (!input.agreementKey) {
      const stamped = await prisma.envelope.update({
        where: { id: row.id },
        data: { agreementKey: row.id, updatedAt: new Date() },
      })
      return mapRow(stamped)
    }
    return mapRow(row)
  },

  async attachPdf(
    id: string,
    file: { filename: string; mimeType: string; bytes: Buffer },
  ): Promise<EnvelopeRecord> {
    const rec = await envelopes.get(id)
    if (!rec) throw new EsignError(`envelope ${id} not found`)
    const object = sourceObject(id)
    await uploadDocumentPdf(object, file.bytes)
    const sha256 = crypto.createHash("sha256").update(file.bytes).digest("hex")
    const attachment: DocumentAttachment = {
      filename: file.filename,
      mimeType: file.mimeType,
      byteSize: file.bytes.length,
      storedAt: object,
      sha256,
      uploadedAt: new Date().toISOString(),
    }
    return persist(id, { attachment })
  },

  async readPdf(
    id: string,
  ): Promise<{ bytes: Buffer; attachment: DocumentAttachment } | undefined> {
    const rec = await envelopes.get(id)
    if (!rec?.attachment) return undefined
    if (!(await objectExists(rec.attachment.storedAt))) return undefined
    return { bytes: await downloadObject(rec.attachment.storedAt), attachment: rec.attachment }
  },

  // Reads the fully-signed PDF: prefers a cached GCS copy, else pulls from
  // Documenso, caches it, and returns the bytes.
  async readSignedPdf(id: string): Promise<Buffer | undefined> {
    const rec = await envelopes.get(id)
    if (!rec) return undefined
    if (rec.signedDocumentPath && (await objectExists(rec.signedDocumentPath))) {
      return downloadObject(rec.signedDocumentPath)
    }
    if (!rec.externalDocumentId || !hasDocumensoCreds()) return undefined
    if (rec.status !== "completed") return undefined
    const bytes = await documenso.downloadSignedPdf(rec.externalDocumentId)
    const object = signedObject(id)
    await uploadDocumentPdf(object, bytes)
    await persist(id, { signedDocumentObject: object })
    return bytes
  },

  async void(
    id: string,
    opts: { reason?: string } = {},
  ): Promise<EnvelopeRecord | undefined> {
    const rec = await envelopes.get(id)
    if (!rec) return undefined
    if (rec.status === "voided") return rec
    if (rec.externalDocumentId && hasDocumensoCreds()) {
      try {
        await documenso.cancelDocument(rec.externalDocumentId, { reason: opts.reason })
      } catch {
        // Local state still flips to voided; operator can reconcile later.
      }
    }
    return persist(id, {
      status: "voided",
      voidedAt: new Date().toISOString(),
      ...(opts.reason ? { voidReason: opts.reason } : {}),
    })
  },

  async resend(
    id: string,
    opts: { recipientEmails?: string[] } = {},
  ): Promise<EnvelopeRecord | undefined> {
    const rec = await envelopes.get(id)
    if (!rec) return undefined
    if (
      rec.status !== "sent" &&
      rec.status !== "viewed" &&
      rec.status !== "partially-signed"
    ) {
      throw new EsignError(
        `cannot resend envelope in status '${rec.status}' — only in-flight envelopes are eligible`,
      )
    }
    if (rec.externalDocumentId && hasDocumensoCreds()) {
      const wanted = opts.recipientEmails
        ? new Set(opts.recipientEmails.map((e) => e.toLowerCase()))
        : undefined
      const recipientIds = rec.recipients
        .filter((r) => {
          if (!r.externalRecipientId) return false
          if (wanted && !wanted.has(r.email.toLowerCase())) return false
          if (!wanted && (r.status === "signed" || r.status === "declined")) return false
          return true
        })
        .map((r) => r.externalRecipientId!)
      if (recipientIds.length === 0) {
        throw new EsignError(
          opts.recipientEmails
            ? `no matching recipients on envelope ${id}: ${opts.recipientEmails.join(", ")}`
            : "no recipients eligible for resend — all signers have either signed, declined, or have no externalRecipientId yet",
        )
      }
      await documenso.resendDocument(rec.externalDocumentId, { recipientIds })
    }
    return persist(id, { lastResendAt: new Date().toISOString() })
  },

  async attachToPayee(id: string, payeeId: string | null): Promise<EnvelopeRecord> {
    const rec = await envelopes.get(id)
    if (!rec) throw new EsignError(`envelope ${id} not found`)
    if (payeeId) {
      const payee = await prisma.payee.findUnique({ where: { id: payeeId } })
      if (!payee) throw new EsignError("Payee not found")
    }
    const row = await prisma.envelope.update({
      where: { id },
      data: { payeeId, updatedAt: new Date() },
    })
    return mapRow(row)
  },
}

// ---------- esign (high-level lifecycle) -----------------------------

export const esign = {
  async send(id: string): Promise<EnvelopeRecord> {
    const rec = await envelopes.get(id)
    if (!rec) throw new EsignError(`envelope ${id} not found`)
    if (!rec.attachment) throw new EsignError(`envelope ${id} has no attached PDF`)
    if (isTerminalStatus(rec.status)) {
      throw new EsignError(`cannot send envelope in terminal status '${rec.status}'`)
    }
    if (rec.sentAt && rec.externalDocumentId) return rec

    const recipients: Recipient[] = rec.recipients.map((r) => ({ ...r }))
    let externalDocumentId = rec.externalDocumentId
    if (!externalDocumentId) {
      const file = await envelopes.readPdf(id)
      if (!file) throw new EsignError(`envelope ${id} attachment missing in storage`)
      const created = await documenso.createDocument({
        title: rec.subject,
        fileName: file.attachment.filename,
        fileBytes: file.bytes,
        recipients: recipients.map((r) => ({
          name: r.name,
          email: r.email,
          role: r.role,
          signingOrder: r.signingOrder,
        })),
        meta: {
          ...(rec.message ? { message: rec.message } : {}),
          subject: rec.subject,
          signingOrder: rec.signingOrderEnabled ? "SEQUENTIAL" : "PARALLEL",
        },
      })
      externalDocumentId = created.documentId
      const byEmail = new Map(created.recipients.map((r) => [r.email.toLowerCase(), r] as const))
      for (let i = 0; i < recipients.length; i++) {
        const remote = byEmail.get(recipients[i].email.toLowerCase())
        if (remote) {
          recipients[i] = {
            ...recipients[i],
            externalRecipientId: remote.recipientId,
            signingUrl: remote.signingUrl,
          }
        }
      }
      await persist(id, {
        externalDocumentId,
        recipients,
        status: rec.status === "draft" ? "uploaded" : rec.status,
      })
    } else {
      for (let i = 0; i < recipients.length; i++) {
        const r = recipients[i]
        if (r.externalRecipientId) continue
        const added = await documenso.addRecipient(externalDocumentId, {
          name: r.name,
          email: r.email,
          role: r.role,
          signingOrder: r.signingOrder,
        })
        recipients[i] = { ...r, externalRecipientId: added.recipientId, signingUrl: added.signingUrl }
        await persist(id, { recipients })
      }
    }

    let fieldsAppliedAt = rec.fieldsAppliedAt
    let fieldsAppliedCount = rec.fieldsAppliedCount ?? 0
    if (rec.fields && rec.fields.length > 0 && !fieldsAppliedAt) {
      const recipientIdByEmail: Record<string, string> = {}
      for (const r of recipients) {
        if (r.externalRecipientId) recipientIdByEmail[r.email.toLowerCase()] = r.externalRecipientId
      }
      await documenso.addFields(externalDocumentId, rec.fields, recipientIdByEmail, {
        startIndex: fieldsAppliedCount,
        onApplied: (idx) => {
          fieldsAppliedCount = idx + 1
          // fire-and-forget checkpoint; resumability tolerates a lost tick
          void persist(id, { fieldsAppliedCount })
        },
      })
      fieldsAppliedAt = new Date().toISOString()
      await persist(id, { fieldsAppliedAt, fieldsAppliedCount })
    }

    await documenso.sendDocument(externalDocumentId, { sendEmail: true })

    const now = new Date().toISOString()
    return persist(id, { status: "sent", sentAt: now })
  },

  async createFromTemplate(
    input: EnvelopeFromTemplateInput,
    actor: EsignActor,
    opts: { payeeId?: string | null } = {},
  ): Promise<EnvelopeRecord> {
    const parsed = EnvelopeFromTemplateSchema.parse(input)
    const template = await documenso.getTemplate(parsed.templateId)
    if (template.recipientRoles.length === 0) {
      throw new EsignError(
        `template ${parsed.templateId} has no recipient roles — cannot create an envelope from it`,
      )
    }
    const recipientsByRole = new Map(parsed.recipients.map((r) => [r.roleId, r] as const))
    const templateRoleIds = new Set(template.recipientRoles.map((r) => r.id))
    const missingRoles = template.recipientRoles.filter((role) => !recipientsByRole.has(role.id))
    if (missingRoles.length > 0) {
      throw new EsignError(
        `template ${parsed.templateId} missing recipient(s) for role(s): ${missingRoles
          .map((r) => r.label || r.id)
          .join(", ")}`,
      )
    }
    const extraRoles = parsed.recipients.filter((r) => !templateRoleIds.has(r.roleId))
    if (extraRoles.length > 0) {
      throw new EsignError(
        `template ${parsed.templateId} does not define role(s): ${extraRoles
          .map((r) => r.roleId)
          .join(", ")}`,
      )
    }

    const recipients: Recipient[] = template.recipientRoles.map((role) => {
      const ri = recipientsByRole.get(role.id)!
      return { name: ri.name, email: ri.email, role: "signer", status: "pending" }
    })
    const kind: EnvelopeKind = parsed.kind ?? deriveKindFromTitle(template.title)
    const created0 = await prisma.envelope.create({
      data: {
        kind,
        subject: parsed.subject,
        message: parsed.message ?? null,
        recipients: recipients as unknown as Prisma.InputJsonValue,
        status: "draft",
        createdBy: actor.email,
        payeeId: opts.payeeId ?? null,
      },
    })
    const envId = created0.id

    const created = await documenso.createDocumentFromTemplate(parsed.templateId, {
      title: parsed.subject,
      recipients: parsed.recipients.map((r) => ({
        roleId: r.roleId,
        name: r.name,
        email: r.email,
      })),
    })
    await documenso.sendDocument(created.documentId, { sendEmail: true })

    const byEmail = new Map(created.recipients.map((r) => [r.email.toLowerCase(), r] as const))
    const recipientsWithIds = recipients.map((r) => {
      const remote = byEmail.get(r.email.toLowerCase())
      return remote
        ? { ...r, externalRecipientId: remote.recipientId, signingUrl: remote.signingUrl }
        : r
    })

    return persist(envId, {
      externalDocumentId: created.documentId,
      recipients: recipientsWithIds,
      status: "sent",
      sentAt: new Date().toISOString(),
      agreementKey: envId,
    })
  },

  async refresh(id: string): Promise<EnvelopeRecord> {
    const rec = await envelopes.get(id)
    if (!rec) throw new EsignError(`envelope ${id} not found`)
    if (!rec.externalDocumentId) return rec

    const remote = await documenso.getDocument(rec.externalDocumentId)
    const recipients: Recipient[] = rec.recipients.map((r) => {
      const match = remote.recipients.find((rr) => rr.email.toLowerCase() === r.email.toLowerCase())
      if (!match) return r
      const status = mapRecipientStatus(match.status)
      const patch: Partial<Recipient> = { status }
      if (status === "signed" && match.signedAt) patch.signedAt = match.signedAt
      if (status === "viewed" && !r.viewedAt) patch.viewedAt = new Date().toISOString()
      if (status === "declined" && !r.declinedAt) patch.declinedAt = new Date().toISOString()
      return { ...r, ...patch }
    })

    const draft: EnvelopeRecord = { ...rec, recipients }
    let nextStatus = recomputeEnvelopeStatus(draft)
    const mappedOverall = mapDocumensoStatusToEnvelopeStatus(remote.status)
    if (
      mappedOverall === "completed" ||
      mappedOverall === "declined" ||
      mappedOverall === "voided" ||
      mappedOverall === "expired"
    ) {
      nextStatus = mappedOverall
    }
    const completedAt =
      nextStatus === "completed"
        ? rec.completedAt ?? remote.completedAt ?? new Date().toISOString()
        : rec.completedAt

    return persist(id, {
      recipients,
      status: nextStatus,
      ...(completedAt ? { completedAt } : {}),
    })
  },

  async applyWebhookEvent(event: DocumensoEvent): Promise<EnvelopeRecord | undefined> {
    const externalId = event.payload.id
    const row = await prisma.envelope.findFirst({ where: { externalDocumentId: externalId } })
    if (!row) return undefined
    const match = mapRow(row)

    const eventKey = webhookEventKey(event)
    const applied = match.appliedEventIds ?? []
    if (applied.includes(eventKey)) return match

    if (match.status === "voided" || match.status === "expired") {
      return persist(match.id, {
        appliedEventIds: appendBounded(applied, eventKey, MAX_APPLIED_EVENT_IDS),
      })
    }

    let draft: EnvelopeRecord = { ...match }
    const now = new Date().toISOString()
    const allRecipients = event.payload.recipients ?? []
    const triggeringRecipient = pickTriggeringRecipient(event.event, allRecipients)

    const auditEntries: Array<{
      action:
        | "document_signed"
        | "document_completed"
        | "document_declined"
        | "document_expired"
      detail?: string
    }> = []

    // Forensic events to persist after the state update. The webhook can't see
    // the signer's TLS fingerprint (only our /sign proxy can), so ja3/ja4 stay
    // null here.
    const sigEvents: Array<{ recipientEmail: string; kind: SignatureEventKindT }> = []

    switch (event.event) {
      case "DOCUMENT_OPENED":
        if (triggeringRecipient?.email) {
          draft = applyRecipientUpdate(draft, triggeringRecipient.email, {
            status: "viewed",
            viewedAt: now,
          })
          sigEvents.push({ recipientEmail: triggeringRecipient.email, kind: "VIEWED" })
        }
        break
      case "DOCUMENT_SIGNED":
      case "DOCUMENT_RECIPIENT_COMPLETED":
        if (triggeringRecipient?.email) {
          const recipientIdx = draft.recipients.findIndex(
            (r) => r.email.toLowerCase() === triggeringRecipient.email.toLowerCase(),
          )
          draft = applyRecipientUpdate(draft, triggeringRecipient.email, {
            status: "signed",
            signedAt: triggeringRecipient.signedAt ?? now,
          })
          auditEntries.push({
            action: "document_signed",
            detail: recipientIdx >= 0 ? `recipient#${recipientIdx + 1}` : undefined,
          })
          sigEvents.push({ recipientEmail: triggeringRecipient.email, kind: "SIGNED" })
        }
        break
      case "DOCUMENT_COMPLETED":
        draft = {
          ...draft,
          recipients: draft.recipients.map((r) => {
            if (r.status === "declined") return r
            if (!isSigningRole(r.role)) return r
            return { ...r, status: "signed", signedAt: r.signedAt ?? now }
          }),
          completedAt: event.payload.completedAt ?? now,
        }
        auditEntries.push({ action: "document_completed" })
        break
      case "DOCUMENT_REJECTED":
        if (triggeringRecipient?.email) {
          const reason = triggeringRecipient.rejectionReason
          const recipientIdx = draft.recipients.findIndex(
            (r) => r.email.toLowerCase() === triggeringRecipient.email.toLowerCase(),
          )
          draft = applyRecipientUpdate(draft, triggeringRecipient.email, {
            status: "declined",
            declinedAt: now,
            ...(reason ? { declinedReason: reason } : {}),
          })
          const tag = recipientIdx >= 0 ? `recipient#${recipientIdx + 1}` : "recipient"
          auditEntries.push({
            action: "document_declined",
            detail: reason ? `${tag}: ${reason}` : tag,
          })
          sigEvents.push({ recipientEmail: triggeringRecipient.email, kind: "DECLINED" })
        }
        break
      case "DOCUMENT_CANCELLED":
        draft = { ...draft, status: "voided", voidedAt: now }
        break
      case "RECIPIENT_EXPIRED":
        if (triggeringRecipient?.email) {
          draft = applyRecipientUpdate(draft, triggeringRecipient.email, {
            status: "declined",
            declinedAt: now,
            declinedReason: "recipient-expired",
          })
        }
        {
          const allDone = draft.recipients.every(
            (r) => r.status === "signed" || r.status === "declined",
          )
          const anyNonSigned = draft.recipients.some((r) => r.status !== "signed")
          if (allDone && anyNonSigned) {
            draft = { ...draft, status: "expired" }
            const recipientIdx = triggeringRecipient?.email
              ? draft.recipients.findIndex(
                  (r) => r.email.toLowerCase() === triggeringRecipient.email.toLowerCase(),
                )
              : -1
            auditEntries.push({
              action: "document_expired",
              detail: recipientIdx >= 0 ? `recipient#${recipientIdx + 1}` : undefined,
            })
          }
        }
        break
      case "DOCUMENT_CREATED":
      case "DOCUMENT_SENT":
        if (draft.status === "draft" || draft.status === "uploaded") {
          draft = { ...draft, status: "sent", sentAt: draft.sentAt ?? now }
        }
        break
      case "DOCUMENT_REMINDER_SENT":
      case "TEMPLATE_CREATED":
      case "TEMPLATE_UPDATED":
      case "TEMPLATE_DELETED":
      case "TEMPLATE_USED":
        // Informational only — no envelope-state change.
        break
      default:
        break
    }

    if (
      draft.status !== "voided" &&
      draft.status !== "expired" &&
      event.event !== "DOCUMENT_CANCELLED"
    ) {
      draft.status = recomputeEnvelopeStatus(draft)
    }

    const updated = await persist(match.id, {
      recipients: draft.recipients,
      status: draft.status,
      ...(draft.sentAt ? { sentAt: draft.sentAt } : {}),
      ...(draft.voidedAt ? { voidedAt: draft.voidedAt } : {}),
      ...(draft.completedAt ? { completedAt: draft.completedAt } : {}),
      appliedEventIds: appendBounded(applied, eventKey, MAX_APPLIED_EVENT_IDS),
    })
    for (const entry of auditEntries) {
      await audit(entry.action, { actorId: null, target: match.id, details: entry.detail ? { detail: entry.detail } : undefined })
    }
    // Best-effort forensic events (no TLS fingerprint available at the webhook
    // — that's only captured by the /sign proxy). Never fail the webhook on a
    // SignatureEvent write.
    for (const se of sigEvents) {
      try {
        await recordSignatureEvent({
          envelopeId: match.id,
          recipientEmail: se.recipientEmail,
          kind: se.kind,
        })
      } catch {
        // swallow — the envelope-state update already succeeded
      }
    }
    return updated
  },

  // ---------- Launch from a file (WS3.1) -----------------------------
  //
  // Creates a draft envelope whose PDF comes from an existing DriveFile's
  // stored GCS object instead of an operator upload. Otherwise identical to
  // the create → attach path so `esign.send` works unchanged.
  async createFromFile(
    input: {
      fileId: string
      subject: string
      message?: string
      recipients: RecipientInput[]
      kind?: EnvelopeKind
      fields?: Field[]
      signingOrderEnabled?: boolean
      expiresAt?: string
      entityId?: string | null
      payeeId?: string | null
    },
    actor: EsignActor,
  ): Promise<EnvelopeRecord> {
    const file = await prisma.driveFile.findUnique({ where: { id: input.fileId } })
    if (!file) throw new EsignError(`file ${input.fileId} not found`)
    if (!(await objectExists(file.gcsObject))) {
      throw new EsignError(`file ${input.fileId} has no stored object in GCS`)
    }
    const bytes = await downloadObject(file.gcsObject)
    const created = await envelopes.create({
      kind: input.kind ?? "other",
      subject: input.subject,
      message: input.message,
      recipients: input.recipients,
      fields: input.fields,
      signingOrderEnabled: input.signingOrderEnabled,
      expiresAt: input.expiresAt,
      createdBy: actor.email,
      payeeId: input.payeeId ?? null,
      sourceFileId: file.id,
      entityId: input.entityId ?? null,
    })
    return envelopes.attachPdf(created.id, {
      filename: file.name,
      mimeType: file.mimeType,
      bytes,
    })
  },

  // ---------- Versioning (WS3.2) -------------------------------------
  //
  // Re-issue an agreement after edits: a NEW envelope sharing the prior's
  // agreementKey, version = max(version)+1, parentEnvelopeId = prior id.
  async reissue(
    envelopeId: string,
    changes: {
      subject?: string
      message?: string
      recipients?: RecipientInput[]
      fields?: Field[]
      signingOrderEnabled?: boolean
      expiresAt?: string
      kind?: EnvelopeKind
      entityId?: string | null
      payeeId?: string | null
    },
    actor: EsignActor,
  ): Promise<EnvelopeRecord> {
    const prior = await envelopes.get(envelopeId)
    if (!prior) throw new EsignError(`envelope ${envelopeId} not found`)
    const agreementKey = prior.agreementKey ?? prior.id
    const versions = await esign.listVersions(agreementKey)
    const maxVersion = versions.reduce(
      (m, v) => Math.max(m, v.version ?? 1),
      prior.version ?? 1,
    )
    const recipients: RecipientInput[] =
      changes.recipients ??
      prior.recipients.map((r) => ({
        name: r.name,
        email: r.email,
        role: r.role,
        signingOrder: r.signingOrder,
      }))
    return envelopes.create({
      kind: changes.kind ?? prior.kind,
      subject: changes.subject ?? prior.subject,
      message: changes.message ?? prior.message,
      recipients,
      fields: changes.fields ?? prior.fields,
      signingOrderEnabled: changes.signingOrderEnabled ?? prior.signingOrderEnabled,
      expiresAt: changes.expiresAt ?? prior.expiresAt,
      createdBy: actor.email,
      payeeId: changes.payeeId ?? prior.payeeId ?? null,
      sourceFileId: prior.sourceFileId ?? null,
      entityId: changes.entityId ?? prior.entityId ?? null,
      agreementKey,
      version: maxVersion + 1,
      parentEnvelopeId: prior.id,
    })
  },

  async listVersions(agreementKey: string): Promise<EnvelopeRecord[]> {
    const rows = await prisma.envelope.findMany({
      where: { agreementKey },
      orderBy: { version: "asc" },
    })
    return rows.map(mapRow)
  },
}

// ---------- Forensic capture (WS3.3) ---------------------------------

/** Persist a per-recipient forensic event. `forensics` comes from the /sign
 *  proxy (TLS fingerprint + IP + headers); the webhook path passes none. */
export async function recordSignatureEvent(input: {
  envelopeId: string
  recipientEmail: string
  kind: SignatureEventKindT
  forensics?: TlsForensics
}): Promise<SignatureEventRecord> {
  const f = input.forensics
  const row = await prisma.signatureEvent.create({
    data: {
      envelopeId: input.envelopeId,
      recipientEmail: input.recipientEmail,
      kind: input.kind,
      ip: f?.ip ?? null,
      userAgent: f?.userAgent ?? null,
      ja3: f?.ja3 ?? null,
      ja4: f?.ja4 ?? null,
      headers: (f?.headers ?? {}) as unknown as Prisma.InputJsonValue,
    },
  })
  return mapSignatureEvent(row)
}

/** All forensic events for one envelope, oldest first. */
export async function listSignatureEvents(envelopeId: string): Promise<SignatureEventRecord[]> {
  const rows = await prisma.signatureEvent.findMany({
    where: { envelopeId },
    orderBy: { createdAt: "asc" },
  })
  return rows.map(mapSignatureEvent)
}

/** Records a VIEWED event for a recipient of an envelope and returns their
 *  Documenso signing URL (or undefined when the envelope/recipient/URL is
 *  missing). Used by the /sign/[token] proxy. */
export async function captureViewAndResolve(
  envelopeId: string,
  recipientEmail: string,
  forensics: TlsForensics,
): Promise<string | undefined> {
  const rec = await envelopes.get(envelopeId)
  if (!rec) return undefined
  const recipient = rec.recipients.find(
    (r) => r.email.toLowerCase() === recipientEmail.toLowerCase(),
  )
  if (!recipient) return undefined
  await recordSignatureEvent({ envelopeId, recipientEmail: recipient.email, kind: "VIEWED", forensics })
  return recipient.signingUrl
}

// ---------- Timeline (WS3.4) -----------------------------------------

/** Aggregate lifecycle + forensic activity across every envelope visible to
 *  the viewer, newest first. Merges Envelope stamps (created/sent/version/
 *  resend), SignatureEvent rows (viewed/signed/declined, with JA3/JA4/IP), and
 *  recipient-JSON timestamps that predate the forensic capture. */
export async function documentsTimeline(viewer?: EsignViewer): Promise<TimelineRow[]> {
  const list = await envelopes.list({}, viewer)
  const ids = list.map((e) => e.id)
  const events = ids.length
    ? await prisma.signatureEvent.findMany({
        where: { envelopeId: { in: ids } },
        orderBy: { createdAt: "asc" },
      })
    : []
  const byId = new Map(list.map((e) => [e.id, e]))
  const rows: TimelineRow[] = []
  // (envelopeId|recipientEmail|kind) already covered by a forensic event, so we
  // don't double-count the recipient-JSON fallback below.
  const covered = new Set<string>()

  for (const ev of events) {
    const env = byId.get(ev.envelopeId)
    const kind = ev.kind.toLowerCase() as TimelineRow["kind"]
    covered.add(`${ev.envelopeId}|${ev.recipientEmail.toLowerCase()}|${kind}`)
    rows.push({
      envelopeId: ev.envelopeId,
      subject: env?.subject ?? ev.envelopeId,
      kind,
      recipient: ev.recipientEmail,
      timestamp: ev.createdAt.toISOString(),
      ja3: ev.ja3 ?? null,
      ja4: ev.ja4 ?? null,
      ip: ev.ip ?? null,
    })
  }

  for (const e of list) {
    rows.push({ envelopeId: e.id, subject: e.subject, kind: "created", actor: e.createdBy, timestamp: e.createdAt, version: e.version })
    if (e.sentAt) rows.push({ envelopeId: e.id, subject: e.subject, kind: "sent", actor: e.createdBy, timestamp: e.sentAt, version: e.version })
    if ((e.version ?? 1) > 1) rows.push({ envelopeId: e.id, subject: e.subject, kind: "version", actor: e.createdBy, timestamp: e.createdAt, version: e.version })
    if (e.lastResendAt) rows.push({ envelopeId: e.id, subject: e.subject, kind: "resend", actor: e.createdBy, timestamp: e.lastResendAt, version: e.version })
    // Recipient-JSON fallback for envelopes signed/viewed/declined before the
    // forensic proxy existed (or without a matching SignatureEvent).
    for (const r of e.recipients) {
      const push = (kind: TimelineRow["kind"], ts?: string) => {
        if (!ts) return
        if (covered.has(`${e.id}|${r.email.toLowerCase()}|${kind}`)) return
        rows.push({ envelopeId: e.id, subject: e.subject, kind, recipient: r.email, timestamp: ts })
      }
      push("signed", r.signedAt)
      push("viewed", r.viewedAt)
      push("declined", r.declinedAt)
    }
  }

  rows.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  return rows
}

// ---------- Pure helpers (verbatim from source) ----------------------

function pickTriggeringRecipient(
  eventType: DocumensoEvent["event"],
  recipients: DocumensoEvent["payload"]["recipients"],
): DocumensoEvent["payload"]["recipients"][number] | undefined {
  if (!recipients || recipients.length === 0) return undefined
  switch (eventType) {
    case "DOCUMENT_SIGNED":
    case "DOCUMENT_RECIPIENT_COMPLETED":
      return recipients
        .filter((r) => r.signingStatus === "SIGNED")
        .sort((a, b) => (b.signedAt ?? "").localeCompare(a.signedAt ?? ""))[0]
    case "DOCUMENT_REJECTED":
      return recipients.find((r) => r.signingStatus === "REJECTED" || r.rejectionReason)
    case "DOCUMENT_OPENED":
      return recipients.find((r) => r.readStatus === "OPENED" && r.signingStatus !== "SIGNED")
    case "RECIPIENT_EXPIRED":
      return recipients.find(
        (r) => r.signingStatus !== "SIGNED" && r.expiresAt && Date.parse(r.expiresAt) <= Date.now(),
      )
    default:
      return undefined
  }
}

function webhookEventKey(event: DocumensoEvent): string {
  const id = event.id ?? event.eventId
  if (id) return `id:${id}`
  const canon = JSON.stringify([
    event.event,
    event.payload.id,
    event.createdAt ?? "",
    (event.payload.recipients ?? [])
      .map((r) => `${r.email}:${r.signingStatus ?? ""}:${r.readStatus ?? ""}:${r.signedAt ?? ""}`)
      .sort()
      .join("|"),
  ])
  return `h:${crypto.createHash("sha256").update(canon).digest("hex").slice(0, 24)}`
}

function appendBounded(arr: string[], v: string, max: number): string[] {
  if (arr.includes(v)) return arr
  const next = [...arr, v]
  return next.length > max ? next.slice(next.length - max) : next
}

function deriveKindFromTitle(title: string): EnvelopeKind {
  const t = title.toLowerCase()
  if (t.includes("sole-director") || t.includes("sole director")) return "sole-director-consent"
  if (t.includes("compliance officer")) return "compliance-officer-designation"
  if (t.includes("officer designation")) return "officer-designation"
  if (t.includes("aml") && (t.includes("program") || t.includes("policy") || t.includes("bsa"))) {
    return "msb-program-policy"
  }
  if (t.includes("independent reviewer")) return "independent-reviewer-engagement"
  return "other"
}

function mapRecipientStatus(documensoRecipientStatus: string): Recipient["status"] {
  switch (documensoRecipientStatus.toUpperCase()) {
    case "SIGNED":
    case "COMPLETED":
      return "signed"
    case "OPENED":
    case "VIEWED":
      return "viewed"
    case "DECLINED":
    case "REJECTED":
      return "declined"
    default:
      return "pending"
  }
}

// Re-export the client-safe surface for convenience.
export {
  ENVELOPE_KINDS,
  KIND_LABELS,
  ENVELOPE_STATUSES,
  RECIPIENT_ROLES,
  EnvelopeCreateSchema,
  EnvelopeFromTemplateSchema,
} from "./types"
export type {
  EnvelopeKind,
  EnvelopeStatus,
  EnvelopeRecord,
  Recipient,
  RecipientRole,
  Field,
  TemplateRecord,
} from "./types"
