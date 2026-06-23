// Client-safe e-sign types + enums + schemas. No node:fs / store imports
// here — this file is imported by both server (lib/esign.ts, API routes)
// and client (pages/documents/*) code. The runtime store + Documenso REST
// transport live in lib/esign.ts and lib/documenso.ts respectively.

import { z } from "zod";

// ---------- Envelope-level enums --------------------------------------

export const ENVELOPE_KINDS = [
  "sole-director-consent",
  "officer-designation",
  "compliance-officer-designation",
  "msb-program-policy",
  "independent-reviewer-engagement",
  "other",
] as const;
export type EnvelopeKind = (typeof ENVELOPE_KINDS)[number];

export const KIND_LABELS: Record<EnvelopeKind, string> = {
  "sole-director-consent": "Sole-director consent",
  "officer-designation": "Officer designation memo",
  "compliance-officer-designation": "Compliance Officer designation",
  "msb-program-policy": "MSB / AML program policy",
  "independent-reviewer-engagement": "Independent reviewer engagement letter",
  "other": "Other",
};

// Status of the envelope as a whole — superset of recipient statuses.
// Map back from Documenso's vocabulary in lib/documenso.ts.
export const ENVELOPE_STATUSES = [
  "draft",      // local record exists; nothing uploaded yet
  "uploaded",   // attached to Documenso but recipients not yet invited
  "sent",       // invites dispatched, awaiting first signature
  "viewed",     // at least one recipient opened the document
  "partially-signed", // some but not all recipients signed
  "completed",  // all recipients signed
  "declined",   // a recipient declined
  "voided",     // we cancelled it
  "expired",    // Documenso aged it out
] as const;
export type EnvelopeStatus = (typeof ENVELOPE_STATUSES)[number];

export const RECIPIENT_ROLES = ["signer", "approver", "cc", "viewer", "assistant"] as const;
export type RecipientRole = (typeof RECIPIENT_ROLES)[number];

// Roles whose `signed` status counts toward envelope completion. cc +
// viewer never sign — they only receive copies / confirm view — so the
// envelope can complete without them. assistant is sequential-mode-only
// and pre-fills fields rather than signing.
export const SIGNING_ROLES: ReadonlySet<RecipientRole> = new Set([
  "signer",
  "approver",
]);

export function isSigningRole(role: RecipientRole): boolean {
  return SIGNING_ROLES.has(role);
}

export const RECIPIENT_STATUSES = ["pending", "viewed", "signed", "declined"] as const;
export type RecipientStatus = (typeof RECIPIENT_STATUSES)[number];

// ---------- Records (persisted) ----------------------------------------

export type Recipient = {
  name: string;
  email: string;
  role: RecipientRole;
  signingOrder?: number;
  status: RecipientStatus;
  externalRecipientId?: string;
  viewedAt?: string;
  signedAt?: string;
  declinedAt?: string;
  // Free-form reason captured from Documenso when the recipient declines,
  // or one we infer locally (e.g. 'email-bounced'). Surfaced in UI.
  declinedReason?: string;
  // Set when Documenso reports the invitation email bounced. Other
  // recipients can still sign; this one is effectively unreachable until
  // an operator fixes the address and resends.
  bouncedAt?: string;
  signingUrl?: string;
};

export type DocumentAttachment = {
  filename: string;
  mimeType: string;
  byteSize: number;
  // path relative to ADMIN_DATA_DIR/uploads/ (so the file follows
  // the data PVC; full path is constructed in lib/esign.ts).
  storedAt: string;
  sha256: string;
  uploadedAt: string;
};

export type EnvelopeRecord = {
  id: string;
  kind: EnvelopeKind;
  subject: string;
  message?: string;
  recipients: Recipient[];
  attachment?: DocumentAttachment;
  status: EnvelopeStatus;
  externalDocumentId?: string;
  externalSignUrl?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  sentAt?: string;
  completedAt?: string;
  voidedAt?: string;
  // Optional operator note explaining why the envelope was voided. Pushed
  // to Documenso when present and stored locally for audit.
  voidReason?: string;
  // ISO-8601 absolute moment after which Documenso should stop accepting
  // signatures. UI surfaces a warning when within 24h of this time.
  expiresAt?: string;
  // Last time we asked Documenso to re-send invitation emails. Audited
  // separately under envelope.resend.
  lastResendAt?: string;
  signedDocumentPath?: string;  // GCS object name of the fully-signed PDF (post-completion)
  notes?: string;
  // Optional link to the Payee this paperwork belongs to — surfaces the
  // envelope on that payee's profile ("legal paperwork they've signed").
  payeeId?: string | null;
  // Per-page field placements assigned by the operator before send. Stored
  // even when sendNow is false so a later "Send" replays them through
  // Documenso. See FieldSchema below for shape + coord normalisation rules.
  fields?: Field[];
  // When true, Documenso enforces signing in the per-recipient
  // signingOrder ranks — recipient #2 can't sign until #1 has. We push
  // this to Documenso as meta.signingOrder = "SEQUENTIAL"; when false
  // (default) it goes as "PARALLEL" and recipients can sign in any
  // order. Without this flag the per-recipient signingOrder numbers
  // are decorative.
  signingOrderEnabled?: boolean;
  // ISO-8601 stamp when we last successfully forwarded `fields` to
  // Documenso. esign.send checks this to avoid double-placing fields on
  // retry (Documenso doesn't dedupe fields server-side).
  fieldsAppliedAt?: string;
  // Number of fields that have been successfully POSTed to Documenso so
  // far. If addFields fails mid-stream this stays at the partial count,
  // so a retry can resume from there instead of replaying the already-
  // applied ones and ending up with duplicate placements.
  fieldsAppliedCount?: number;
  // Bounded history of webhook event identifiers we've already applied
  // to this envelope — keeps replays idempotent. We trim to a fixed
  // window (last 50) so the record can't grow unboundedly.
  appliedEventIds?: string[];
};

// Max number of webhook event ids we remember per envelope. 50 is well
// above any realistic per-document burst (signed/opened/completed for a
// handful of recipients) but small enough to bound record size.
export const MAX_APPLIED_EVENT_IDS = 50;

// ---------- Input schemas (Zod) ----------------------------------------

// Loose RFC 5321 cap — 254 chars is the longest single email an MTA is
// required to accept. Strings beyond this are almost certainly typos /
// pastes of junk and Documenso would reject them anyway.
const MAX_EMAIL_LENGTH = 254;

export const RecipientInputSchema = z.object({
  name: z.string().min(1, "recipient name required").max(200),
  email: z
    .string()
    .email("recipient email must be a valid email")
    .max(MAX_EMAIL_LENGTH, `recipient email exceeds ${MAX_EMAIL_LENGTH} char RFC 5321 limit`),
  role: z.enum(RECIPIENT_ROLES).default("signer"),
  signingOrder: z.number().int().min(1).optional(),
});
export type RecipientInput = z.infer<typeof RecipientInputSchema>;

// Reject NaN/Infinity early. Zod's z.number() allows these by default —
// silently storing them then surfacing as `NaN` page coords in the
// Documenso request body, which 400s far away from the original bug.
const finite = (msg = "must be a finite number") =>
  z.number().refine((n) => Number.isFinite(n), msg);

// ---------- Field placement (drag-drop signature fields) --------------
// When the operator uploads a one-off PDF, they place per-recipient
// signature/date/initial/text fields on each page in the browser using
// PdfFieldEditor. The component emits an array of Field objects whose
// x/y/width/height are NORMALISED (0–1, fraction of page width/height).
// We persist them on the EnvelopeRecord so they survive an upload-and-
// hold workflow, then forward them to Documenso during esign.send (see
// lib/esign.ts) — Documenso wants page-% coords, so we multiply by 100
// at the transport boundary (lib/documenso.ts#addFields).

export const FIELD_TYPES = [
  "signature",
  "date",
  "initial",
  "text",
  "checkbox",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

// Smallest field a signer can comfortably tap. Anything below ~1% of the
// page edge is almost certainly a stray click rather than an intentional
// placement; rejecting at the schema level catches both UI bugs and API
// callers that bypass the editor.
const MIN_FIELD_DIM = 0.01;

export const FieldSchema = z
  .object({
    type: z.enum(FIELD_TYPES),
    // The recipient this field is assigned to. Matched against
    // Recipient.email when esign.send maps it to a Documenso recipientId.
    recipientEmail: z
      .string()
      .email("field.recipientEmail must be a valid email")
      .max(MAX_EMAIL_LENGTH),
    // 1-based page number — finite to reject NaN/Infinity from buggy
    // editor math.
    page: finite("field.page must be a finite number").pipe(
      z.number().int().min(1, "field.page must be >= 1"),
    ),
    // All four coords are fractions of page width/height in [0, 1].
    x: finite("field.x must be finite").pipe(
      z.number().min(0, "field.x must be >= 0").max(1, "field.x must be <= 1"),
    ),
    y: finite("field.y must be finite").pipe(
      z.number().min(0, "field.y must be >= 0").max(1, "field.y must be <= 1"),
    ),
    width: finite("field.width must be finite").pipe(z
      .number()
      .min(MIN_FIELD_DIM, `field.width must be >= ${MIN_FIELD_DIM}`)
      .max(1, "field.width must be <= 1")),
    height: finite("field.height must be finite").pipe(z
      .number()
      .min(MIN_FIELD_DIM, `field.height must be >= ${MIN_FIELD_DIM}`)
      .max(1, "field.height must be <= 1")),
    required: z.boolean().optional(),
    label: z.string().max(200).optional(),
  })
  .superRefine((f, ctx) => {
    if (f.x + f.width > 1.0001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["width"],
        message: `field x + width (${(f.x + f.width).toFixed(3)}) extends past right page edge`,
      });
    }
    if (f.y + f.height > 1.0001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["height"],
        message: `field y + height (${(f.y + f.height).toFixed(3)}) extends past bottom page edge`,
      });
    }
  });
export type Field = z.infer<typeof FieldSchema>;

export const EnvelopeCreateSchema = z.object({
  kind: z.enum(ENVELOPE_KINDS),
  subject: z
    .string()
    .min(1, "subject required")
    .max(200)
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, "subject required"),
  message: z.string().max(2000).optional(),
  recipients: z.array(RecipientInputSchema).min(1, "at least one recipient required"),
  // Optional field placements from the PdfFieldEditor. When present we
  // forward them to Documenso (POST /documents/{id}/fields per field) in
  // esign.send, after recipients have been added.
  fields: z.array(FieldSchema).optional(),
  // If true, after upload we immediately call documenso.sendDocument.
  // If false (default), the envelope stays in 'uploaded' until an
  // operator clicks Send.
  sendNow: z.boolean().default(false),
  // If true, Documenso enforces strict sequential signing based on the
  // per-recipient signingOrder ranks. When false (default), recipients
  // can sign in any order — the order numbers are decorative.
  signingOrderEnabled: z.boolean().default(false),
  // Optional ISO-8601 deadline. When set we forward it to Documenso (if
  // creds available) and surface a warning banner in UI within the
  // 24-hour window. Must be in the future at create time — sending an
  // envelope with an already-expired deadline is almost certainly a UI
  // bug or a stale draft replay.
  expiresAt: z
    .string()
    .datetime({ message: "expiresAt must be an ISO-8601 datetime" })
    .optional(),
})
  .superRefine((val, ctx) => {
    // Recipients must have unique emails (case-insensitive). Documenso
    // accepts duplicates but the signing experience is broken: both
    // entries see the same audit row and field placements get applied
    // to whichever recipient row ended up matching first.
    const seen = new Map<string, number>();
    val.recipients.forEach((r, i) => {
      const e = r.email.toLowerCase();
      if (seen.has(e)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["recipients", i, "email"],
          message: `duplicate recipient email ${r.email} (also at index ${seen.get(e)})`,
        });
      } else {
        seen.set(e, i);
      }
    });
    // When sequential signing is requested every SIGNING recipient
    // (signer/approver) must have a unique, contiguous 1..N rank.
    // Documenso's SEQUENTIAL mode silently misbehaves on gaps or
    // duplicates — we reject at the schema layer so the operator sees
    // a clear error instead of a baffled envelope state.
    if (val.signingOrderEnabled) {
      const signers = val.recipients
        .map((r, i) => ({ r, i }))
        .filter(({ r }) => r.role === "signer" || r.role === "approver");
      const ranks = signers
        .map(({ r }) => r.signingOrder)
        .filter((n): n is number => typeof n === "number");
      if (ranks.length !== signers.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["recipients"],
          message:
            "signingOrderEnabled requires every signer/approver to have a signingOrder number",
        });
      } else {
        const sorted = [...ranks].sort((a, b) => a - b);
        const dupes = sorted.filter((n, idx) => idx > 0 && sorted[idx - 1] === n);
        if (dupes.length > 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["recipients"],
            message: `signingOrder ranks must be unique — duplicates: ${[...new Set(dupes)].join(", ")}`,
          });
        }
        // Contiguous 1..N — Documenso treats per-rank ties as parallel
        // *within* the sequence, but gaps make later signers wait
        // forever for a recipient that doesn't exist.
        const expected = sorted.map((_, i) => i + 1);
        if (sorted.some((n, i) => n !== expected[i])) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["recipients"],
            message: `signingOrder must form a contiguous 1..${signers.length} sequence — got [${sorted.join(", ")}]`,
          });
        }
      }
    }
    // expiresAt must be in the future. We allow a tiny epsilon for clock
    // skew between the client and server — anything older than 5 minutes
    // ago is clearly bogus.
    if (val.expiresAt) {
      const expiry = Date.parse(val.expiresAt);
      if (Number.isFinite(expiry) && expiry < Date.now() - 5 * 60 * 1000) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["expiresAt"],
          message: "expiresAt must be in the future",
        });
      }
    }
    // Every field must reference a recipient that's in this envelope —
    // otherwise the Documenso addFields call would 400 at send time —
    // AND the assigned recipient must have role 'signer'. cc/viewer
    // recipients don't sign and can't hold fields.
    if (!val.fields || val.fields.length === 0) return;
    const byEmail = new Map(
      val.recipients.map((r) => [r.email.toLowerCase(), r] as const),
    );
    for (let i = 0; i < val.fields.length; i++) {
      const f = val.fields[i];
      const match = byEmail.get(f.recipientEmail.toLowerCase());
      if (!match) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fields", i, "recipientEmail"],
          message: `field.recipientEmail ${f.recipientEmail} is not in recipients`,
        });
        continue;
      }
      if (match.role !== "signer" && match.role !== "approver") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fields", i, "recipientEmail"],
          message: `field assigned to recipient with role '${match.role}' — only signer/approver can hold fields`,
        });
      }
    }
  });
export type EnvelopeCreateInput = z.infer<typeof EnvelopeCreateSchema>;

// ---------- Templates (Documenso pre-placed signature fields) ---------
// Documenso lets an operator upload a PDF once, drag signature/date
// fields into place, assign each field to a recipient ROLE (a stable
// label like "Director" or "AML Compliance Officer"), and save the
// result as a Template. Subsequent envelopes can be spawned from the
// template by supplying real names + emails for each role — no need to
// re-place fields. This is the unlock for recurring docs (annual AML
// reviews, future officer designations).

export type TemplateRecipientRole = {
  // Stable identifier for the role within the template. We accept BOTH
  // the Documenso recipient row id (numeric) and a free-form role key
  // (e.g. "director") so the UI can address roles by whatever Documenso
  // returns. The route forwards this through to the
  // generate-document call unchanged.
  id: string;
  // Human label the UI shows next to the name/email inputs. Falls back
  // to id when Documenso doesn't return a friendlier name.
  label: string;
  // Optional default email (e.g. the operator pre-filled it in the
  // template wizard). When set the UI prefills the field.
  defaultEmail?: string;
  // Optional default name.
  defaultName?: string;
};

export type TemplateRecord = {
  id: string;
  title: string;
  recipientRoles: TemplateRecipientRole[];
};

// Per-role recipient input for create-from-template.
export const TemplateRecipientInputSchema = z.object({
  roleId: z.string().min(1, "roleId required"),
  name: z.string().min(1, "recipient name required"),
  email: z.string().email("recipient email must be a valid email"),
});
export type TemplateRecipientInput = z.infer<typeof TemplateRecipientInputSchema>;

export const EnvelopeFromTemplateSchema = z
  .object({
    templateId: z.string().min(1, "templateId required"),
    // The envelope subject + optional message override Documenso's
    // template defaults (which the operator set when uploading). We
    // always require subject so audit + the row list show something
    // useful.
    subject: z
      .string()
      .min(1, "subject required")
      .max(200)
      .transform((s) => s.trim())
      .refine((s) => s.length > 0, "subject required"),
    message: z.string().max(2000).optional(),
    // Map template role-id → real recipient. UI guarantees one entry
    // per role; we validate min(1) here as a sanity check.
    recipients: z.array(TemplateRecipientInputSchema).min(1, "at least one recipient required"),
    // Optional explicit kind override; when omitted we derive 'other' so
    // arbitrary operator-uploaded templates work without needing to map
    // their title back to one of the EnvelopeKind enum values.
    kind: z.enum(ENVELOPE_KINDS).optional(),
  })
  .superRefine((val, ctx) => {
    // Recipient roleIds + emails must be unique within the input. A
    // template role mapped twice is almost always a UI bug; a duplicate
    // email across two roles is a Documenso anti-pattern (the recipient
    // gets two parallel signing sessions).
    const seenRole = new Map<string, number>();
    const seenEmail = new Map<string, number>();
    val.recipients.forEach((r, i) => {
      if (seenRole.has(r.roleId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["recipients", i, "roleId"],
          message: `duplicate roleId ${r.roleId} (also at index ${seenRole.get(r.roleId)})`,
        });
      } else {
        seenRole.set(r.roleId, i);
      }
      const e = r.email.toLowerCase();
      if (seenEmail.has(e)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["recipients", i, "email"],
          message: `duplicate recipient email ${r.email} (also at index ${seenEmail.get(e)})`,
        });
      } else {
        seenEmail.set(e, i);
      }
    });
  });
export type EnvelopeFromTemplateInput = z.infer<typeof EnvelopeFromTemplateSchema>;

// ---------- Documenso webhook event shape ------------------------------
//
// Documenso v1 webhooks deliver a single envelope shape per event,
// with the event discriminator as a SCREAMING_SNAKE_CASE string at the
// top level. The payload is the full document object — same shape for
// every event type. Per-recipient events (DOCUMENT_SIGNED, OPENED,
// REJECTED, RECIPIENT_EXPIRED, RECIPIENT_COMPLETED) require the handler
// to scan `payload.recipients[]` and find the recipient whose state
// reflects the event (Documenso doesn't flag a recipientId at the top
// level — see lib/esign.ts#applyWebhookEvent for the scanning logic).
//
// Verified against:
//   - packages/prisma/schema.prisma → WebhookTriggerEvents enum
//   - packages/lib/types/webhook-payload.ts → ZWebhookPayloadSchema
// on documenso/main.

export const DOCUMENSO_EVENT_TYPES = [
  "DOCUMENT_CREATED",
  "DOCUMENT_SENT",
  "DOCUMENT_OPENED",
  "DOCUMENT_SIGNED",
  "DOCUMENT_RECIPIENT_COMPLETED",
  "DOCUMENT_COMPLETED",
  "DOCUMENT_REJECTED",
  "DOCUMENT_CANCELLED",
  "DOCUMENT_REMINDER_SENT",
  "RECIPIENT_EXPIRED",
  "TEMPLATE_CREATED",
  "TEMPLATE_UPDATED",
  "TEMPLATE_DELETED",
  "TEMPLATE_USED",
] as const;
export type DocumensoEventType = (typeof DOCUMENSO_EVENT_TYPES)[number];

// Documenso recipient shape inside the webhook payload — captured at
// the moment the event was emitted. We use this to scan for the
// recipient whose status reflects the event (no top-level recipientId).
const WebhookRecipientSchema = z.object({
  id: z.union([z.string(), z.number()]).transform((v) => String(v)),
  email: z.string().email(),
  name: z.string().optional().nullable().transform((v) => v ?? undefined),
  // Documenso ships these three columns separately; the handler
  // coalesces them.
  readStatus: z.string().optional(),
  signingStatus: z.string().optional(),
  sendStatus: z.string().optional(),
  signedAt: z.union([z.string(), z.date()]).optional().nullable()
    .transform((v) => {
      if (v === null || v === undefined) return undefined;
      return typeof v === "string" ? v : v.toISOString();
    }),
  rejectionReason: z.string().optional().nullable().transform((v) => v ?? undefined),
  expiresAt: z.union([z.string(), z.date()]).optional().nullable()
    .transform((v) => {
      if (v === null || v === undefined) return undefined;
      return typeof v === "string" ? v : v.toISOString();
    }),
});

export const DocumensoEventSchema = z.object({
  event: z.enum(DOCUMENSO_EVENT_TYPES),
  // Documenso does NOT supply a delivery-level event id. Retries replay
  // the same payload byte-for-byte (same createdAt), so the
  // (event, payload.id, createdAt) tuple is a stable dedup key per
  // delivery. We accept optional id/eventId for forward-compat in case
  // Documenso adds one.
  id: z.union([z.string(), z.number()]).transform((v) => String(v)).optional(),
  eventId: z.union([z.string(), z.number()]).transform((v) => String(v)).optional(),
  // ISO timestamp inserted by the Documenso job runner at the moment of
  // delivery — feeds our replay-dedup hash.
  createdAt: z.string().optional(),
  webhookEndpoint: z.string().optional(),
  payload: z
    .object({
      id: z.union([z.string(), z.number()]).transform((v) => String(v)),
      externalId: z.union([z.string(), z.number()]).optional().nullable()
        .transform((v) => v === null || v === undefined ? undefined : String(v)),
      title: z.string().optional(),
      status: z.string().optional(),
      completedAt: z.union([z.string(), z.date()]).optional().nullable()
        .transform((v) => {
          if (v === null || v === undefined) return undefined;
          return typeof v === "string" ? v : v.toISOString();
        }),
      recipients: z.array(WebhookRecipientSchema).optional().default([]),
      // Capital-R alias Documenso also ships (Prisma relation name) —
      // some versions emit one, some the other, some both.
      Recipient: z.array(WebhookRecipientSchema).optional(),
    })
    // Hoist the capital-R variant onto `recipients` so the handler can
    // look at just one source of truth.
    .transform((p) => ({
      ...p,
      recipients: p.recipients.length > 0 ? p.recipients : (p.Recipient ?? []),
    })),
});
export type DocumensoEvent = z.infer<typeof DocumensoEventSchema>;
export type DocumensoEventRecipient = z.infer<typeof WebhookRecipientSchema>;
