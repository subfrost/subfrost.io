// Documenso v1 REST client.
//
// Matches the published Documenso v1 contract:
//   https://github.com/documenso/documenso/blob/main/packages/api/v1/contract.ts
// We target v1 because Documenso has committed to long-term support and
// v1's document-centric verbs map cleanly onto our admin console flow.
// v2 is envelope-centric + multipart-everywhere and adds ceremony
// without payoff for our use case.
//
// Base URL: ${DOCUMENSO_API_URL}/api/v1
// Auth:     Authorization: Bearer ${DOCUMENSO_API_KEY}
//   (The bare `api_xxx` form also works per the contract middleware;
//   we send Bearer for forward-compat with v2 + standard tooling.)
//
// When DOCUMENSO_API_URL + DOCUMENSO_API_KEY are unset we fall back to a
// no-op mock so local dev + tests work without network calls.
//
// The state machine + envelope CRUD lives in lib/esign.ts. This module is
// the typed transport layer — no persistence, no audit, no business
// rules.

import crypto from "node:crypto";

import {
  DocumensoEventSchema,
  type DocumensoEvent,
  type EnvelopeStatus,
  type Field,
  type FieldType,
  type RecipientRole,
  type TemplateRecord,
  type TemplateRecipientRole,
} from "./types";

// ---------- Env readers ------------------------------------------------
// Read at call-time (not module-load) so tests can flip env vars between
// imports without needing to also flush this module from the registry.

export function DOCUMENSO_API_URL(): string {
  return (process.env.DOCUMENSO_API_URL ?? "").trim();
}
export function DOCUMENSO_API_KEY(): string {
  return (process.env.DOCUMENSO_API_KEY ?? "").trim();
}
export function DOCUMENSO_WEBHOOK_SECRET(): string {
  return (process.env.DOCUMENSO_WEBHOOK_SECRET ?? "").trim();
}

export function hasDocumensoCreds(): boolean {
  const url = DOCUMENSO_API_URL();
  const key = DOCUMENSO_API_KEY();
  if (!url || !key) return false;
  if (!/^https?:\/\//i.test(url)) return false;
  return true;
}

// LOCAL- prefixed document/recipient IDs are minted by the mock fallback
// when no creds are configured. They must never be sent to a real
// Documenso instance — exposed as a helper so callers can short-circuit.
export function isLocalId(id: string | undefined): boolean {
  return typeof id === "string" && id.startsWith("LOCAL-");
}

// ---------- Network helpers -------------------------------------------

const FETCH_TIMEOUT_MS = 30_000;

async function timedFetch(
  url: string,
  init: RequestInit,
  ctx: string,
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (err) {
    const e = err as { name?: string; message?: string };
    if (e?.name === "AbortError") {
      throw new DocumensoNetworkError(
        `documenso.${ctx}: timeout after ${FETCH_TIMEOUT_MS}ms`,
        "timeout",
      );
    }
    throw new DocumensoNetworkError(
      `documenso.${ctx}: ${e?.message ?? "network error"}`,
      "network",
    );
  } finally {
    clearTimeout(t);
  }
}

export class DocumensoNetworkError extends Error {
  kind: "network" | "timeout";
  constructor(message: string, kind: "network" | "timeout") {
    super(message);
    this.name = "DocumensoNetworkError";
    this.kind = kind;
  }
}

export class DocumensoHttpError extends Error {
  status: number;
  bodySnippet: string;
  constructor(status: number, message: string, bodySnippet: string) {
    super(message);
    this.name = "DocumensoHttpError";
    this.status = status;
    this.bodySnippet = bodySnippet;
  }
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${DOCUMENSO_API_KEY()}`,
  };
}

function apiBase(): string {
  // Use URL.origin to drop any accidental query string / fragment /
  // path the operator may have stuck on DOCUMENSO_API_URL. Falls back
  // to the simple trailing-slash strip if the URL is malformed (which
  // hasDocumensoCreds should have already rejected, but defense in
  // depth).
  const raw = DOCUMENSO_API_URL();
  try {
    return `${new URL(raw).origin}/api/v1`;
  } catch {
    return `${raw.replace(/\/$/, "")}/api/v1`;
  }
}

async function ensureOk(resp: Response, ctx: string): Promise<void> {
  if (resp.ok) return;
  let body = "";
  try {
    body = await resp.text();
  } catch {
    body = "<unreadable body>";
  }
  const snippet = body.slice(0, 200);
  let hint = "";
  if (resp.status === 401 || resp.status === 403) {
    hint = "auth failed — check DOCUMENSO_API_KEY: ";
  } else if (resp.status === 404) {
    hint = "not found: ";
  } else if (resp.status === 429) {
    hint = "rate limited: ";
  } else if (resp.status >= 500) {
    hint = "Documenso upstream error: ";
  }
  throw new DocumensoHttpError(
    resp.status,
    `documenso.${ctx}: ${hint}HTTP ${resp.status} ${resp.statusText} — ${snippet}`,
    snippet,
  );
}

function randSuffix(): string {
  return crypto.randomBytes(4).toString("hex").slice(0, 6);
}

// ---------- Field-type + role wire formats ----------------------------
// Our internal vocabulary uses lowercase; Documenso uses SCREAMING_SNAKE.
// Verified against packages/prisma/schema.prisma on documenso/main.

export function documensoFieldType(t: FieldType): string {
  switch (t) {
    case "signature":
      return "SIGNATURE";
    case "date":
      return "DATE";
    case "initial":
      return "INITIALS"; // Documenso uses the plural form
    case "text":
      return "TEXT";
    case "checkbox":
      return "CHECKBOX";
  }
}

// fieldMeta.type is a lowercase discriminator that must match the
// top-level `type` slot. v2.11 hardened ZCreateFieldMutationSchema to
// require this — without it, label/required get rejected as
// "unrecognized keys" and the whole request 400s. Note "initials" is
// plural here too, matching ZInitialsFieldMeta.
export function documensoFieldMetaType(t: FieldType): string {
  switch (t) {
    case "signature":
      return "signature";
    case "date":
      return "date";
    case "initial":
      return "initials";
    case "text":
      return "text";
    case "checkbox":
      return "checkbox";
  }
}

// Documenso accepts decimal page-% values in [0, 100]. We clamp to 2
// decimals so the wire payload stays small and predictable.
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------- Documenso ID coercion -------------------------------------
// Documenso v1 IDs are integers on the wire (document, recipient, field).
// We coerce to strings on ingest because our local records use strings
// (so they share storage shape with the LOCAL- mock ids).

function asString(v: string | number | null | undefined): string {
  if (v === null || v === undefined) {
    throw new Error("expected id but got null/undefined");
  }
  return String(v);
}

// ---------- Caller-visible types --------------------------------------

export type DocumensoCreateDocumentResult = {
  documentId: string;
  // Per-recipient details captured in the create-document response.
  // Callers MUST match these back to their local recipient rows by email
  // (Documenso doesn't echo our internal ids).
  recipients: Array<{
    email: string;
    recipientId: string;
    signingUrl?: string;
  }>;
};

export type DocumensoAddRecipientResult = {
  recipientId: string;
  signingUrl?: string;
};

export type DocumensoRecipientStatus = {
  email: string;
  recipientId?: string;
  // Coalesced lifecycle status derived from Documenso's three columns
  // (sendStatus / readStatus / signingStatus). One of:
  //   NOT_SENT | NOT_OPENED | OPENED | SIGNED | REJECTED
  status: string;
  signedAt?: string;
  // The raw rejectionReason from Documenso, when SigningStatus = REJECTED.
  rejectionReason?: string;
};

export type DocumensoDocument = {
  // One of DRAFT | PENDING | COMPLETED | REJECTED (Documenso enum).
  status: string;
  recipients: DocumensoRecipientStatus[];
  completedAt?: string;
  signedDocumentUrl?: string;
};

// ---------- Mock-fallback templates -----------------------------------
// Returned by listTemplates / getTemplate when no API creds are
// configured. Mirrors the four corp PDFs operators upload via presets.

export const STUB_TEMPLATES: TemplateRecord[] = [
  {
    id: "LOCAL-tpl-1",
    title: "Sole-Director Consent",
    recipientRoles: [{ id: "director", label: "Sole Director" }],
  },
  {
    id: "LOCAL-tpl-2",
    title: "AML Officer Designation Memo",
    recipientRoles: [
      { id: "director", label: "Sole Director" },
      { id: "officer", label: "AML Compliance Officer" },
    ],
  },
  {
    id: "LOCAL-tpl-3",
    title: "AML/BSA Program Adoption",
    recipientRoles: [{ id: "director", label: "Sole Director" }],
  },
  {
    id: "LOCAL-tpl-4",
    title: "Independent Reviewer Engagement",
    recipientRoles: [
      { id: "officer", label: "AML Compliance Officer" },
      { id: "reviewer", label: "Independent Reviewer" },
    ],
  },
];

// ---------- Template-row normalisers ----------------------------------
// Documenso v1 templates surface recipients as a capital-R `Recipient[]`
// (the Prisma relation name). For forward-compat we also accept the more
// natural lower-r `recipients[]` shape some self-hosted versions emit.

type RawTemplateRecipient = {
  id?: string | number;
  recipientId?: string | number;
  role?: string;
  roleLabel?: string;
  label?: string;
  name?: string;
  email?: string;
  signingOrder?: number | null;
};

function humanRoleLabel(role: string): string {
  return role
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function normaliseTemplateRecipient(r: RawTemplateRecipient): TemplateRecipientRole {
  const id = r.id ?? r.recipientId ?? r.role ?? "recipient";
  const label =
    r.roleLabel ?? r.label ?? (r.role ? humanRoleLabel(r.role) : String(id));
  return {
    id: String(id),
    label,
    defaultName: r.name,
    defaultEmail: r.email,
  };
}

type RawTemplate = {
  id?: string | number;
  templateId?: string | number;
  title?: string;
  name?: string;
  // Documenso v1 uses capital R/F (Prisma relation names) in template
  // responses; some self-hosted versions emit lowercase. Accept both.
  Recipient?: RawTemplateRecipient[];
  recipients?: RawTemplateRecipient[];
};

function normaliseTemplate(t: RawTemplate): TemplateRecord {
  const id = t.id ?? t.templateId;
  if (id === undefined || id === null) {
    throw new Error("documenso template: response missing id");
  }
  const rawRecipients = t.Recipient ?? t.recipients ?? [];
  return {
    id: String(id),
    title: String(t.title ?? t.name ?? "(untitled template)"),
    recipientRoles: rawRecipients.map(normaliseTemplateRecipient),
  };
}

// ---------- Coalesce Documenso recipient tri-status -------------------
// Documenso splits recipient state across three Prisma enums. For our
// state machine we coalesce them into a single value mirroring the
// "what is this recipient currently doing" question.

function coalesceRecipientStatus(
  readStatus: string | undefined,
  signingStatus: string | undefined,
  sendStatus: string | undefined,
): string {
  if (signingStatus === "SIGNED") return "SIGNED";
  if (signingStatus === "REJECTED") return "REJECTED";
  if (readStatus === "OPENED") return "OPENED";
  if (sendStatus === "SENT") return "NOT_OPENED";
  return "NOT_SENT";
}

// ---------- Client ----------------------------------------------------

type CreateDocumentRecipientInput = {
  name: string;
  email: string;
  role: RecipientRole;
  signingOrder?: number;
};

export const documenso = {
  // Atomic create-document call.
  //
  // Internally drives the two-step Documenso v1 flow:
  //   1. POST /api/v1/documents → JSON, returns { uploadUrl, documentId, recipients[] }
  //   2. PUT <uploadUrl> with raw PDF bytes
  //
  // If step 2 fails after step 1, the caller will see the error; on
  // retry we'll POST again and get a different documentId (the first
  // attempt's draft is orphaned in Documenso — visible to operators in
  // the Drafts tab). For our flows that's acceptable; if we ever need
  // resumable uploads we'd split this into createDocumentMetadata +
  // uploadPdf with the caller persisting the uploadUrl between calls.
  async createDocument(opts: {
    title: string;
    fileName: string;
    fileBytes: Buffer;
    recipients: CreateDocumentRecipientInput[];
    externalId?: string;
    meta?: {
      subject?: string;
      message?: string;
      timezone?: string;
      dateFormat?: string;
      redirectUrl?: string;
      signingOrder?: "PARALLEL" | "SEQUENTIAL";
      language?: string;
      distributionMethod?: "EMAIL" | "NONE";
    };
  }): Promise<DocumensoCreateDocumentResult> {
    if (!hasDocumensoCreds()) {
      const docId = `LOCAL-${randSuffix()}`;
      return {
        documentId: docId,
        recipients: opts.recipients.map((r) => ({
          email: r.email,
          recipientId: `LOCAL-rcpt-${randSuffix()}`,
        })),
      };
    }
    // Step 1: POST /documents with JSON metadata + recipients. Documenso
    // returns a presigned S3 URL for the PDF upload + recipient rows
    // with their freshly-minted ids and signing URLs.
    const body = {
      title: opts.title,
      ...(opts.externalId ? { externalId: opts.externalId } : {}),
      recipients: opts.recipients.map((r) => ({
        name: r.name,
        email: r.email,
        role: r.role.toUpperCase(),
        ...(typeof r.signingOrder === "number" ? { signingOrder: r.signingOrder } : {}),
      })),
      ...(opts.meta ? { meta: opts.meta } : {}),
    };
    const resp = await timedFetch(
      `${apiBase()}/documents`,
      {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      "createDocument",
    );
    await ensureOk(resp, "createDocument");
    const data = (await resp.json()) as {
      uploadUrl?: string;
      documentId?: string | number;
      recipients?: Array<{
        recipientId?: string | number;
        email?: string;
        signingUrl?: string;
      }>;
    };
    const documentId = asString(data.documentId);
    const uploadUrl = data.uploadUrl;
    if (!uploadUrl) {
      throw new Error("documenso.createDocument: response missing uploadUrl");
    }

    // Step 2: PUT the raw PDF bytes to the presigned URL. This bypasses
    // Documenso (goes straight to S3) so authHeaders() should NOT be
    // included — the URL itself carries authorisation.
    const putResp = await timedFetch(
      uploadUrl,
      {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: new Uint8Array(opts.fileBytes),
      },
      "createDocument.uploadPdf",
    );
    if (!putResp.ok) {
      const snippet = await putResp.text().catch(() => "<unreadable body>");
      throw new DocumensoHttpError(
        putResp.status,
        `documenso.createDocument.uploadPdf: HTTP ${putResp.status} ${putResp.statusText} — ${snippet.slice(0, 200)}`,
        snippet.slice(0, 200),
      );
    }

    const recipients = (data.recipients ?? []).map((r) => ({
      email: r.email ?? "",
      recipientId: asString(r.recipientId),
      signingUrl: r.signingUrl,
    }));
    return { documentId, recipients };
  },

  async addRecipient(
    documentId: string,
    opts: {
      name: string;
      email: string;
      role: RecipientRole;
      signingOrder?: number;
    },
  ): Promise<DocumensoAddRecipientResult> {
    if (!hasDocumensoCreds()) {
      return { recipientId: `LOCAL-rcpt-${randSuffix()}` };
    }
    const resp = await timedFetch(
      `${apiBase()}/documents/${encodeURIComponent(documentId)}/recipients`,
      {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          name: opts.name,
          email: opts.email,
          role: opts.role.toUpperCase(),
          ...(typeof opts.signingOrder === "number" ? { signingOrder: opts.signingOrder } : {}),
        }),
      },
      "addRecipient",
    );
    await ensureOk(resp, "addRecipient");
    // v1 response uses bare `id` at the top level for this endpoint
    // (note: distinct from the create-document response where the
    // recipients array uses `recipientId`).
    const data = (await resp.json()) as {
      id?: string | number;
      recipientId?: string | number;
      signingUrl?: string;
    };
    const id = data.id ?? data.recipientId;
    if (id === undefined || id === null) {
      throw new Error("documenso.addRecipient: response missing id");
    }
    return { recipientId: String(id), signingUrl: data.signingUrl };
  },

  async sendDocument(
    documentId: string,
    opts: { sendEmail?: boolean; sendCompletionEmails?: boolean } = {},
  ): Promise<void> {
    if (!hasDocumensoCreds()) return;
    if (isLocalId(documentId)) return;
    const resp = await timedFetch(
      `${apiBase()}/documents/${encodeURIComponent(documentId)}/send`,
      {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          sendEmail: opts.sendEmail ?? true,
          ...(opts.sendCompletionEmails !== undefined
            ? { sendCompletionEmails: opts.sendCompletionEmails }
            : {}),
        }),
      },
      "sendDocument",
    );
    await ensureOk(resp, "sendDocument");
  },

  // Add per-recipient signature fields. Documenso v1 supports either a
  // single field object or an array; we send one-by-one so that the
  // onApplied callback can checkpoint partial progress for resumability.
  // Coordinates are page percentages (0–100, top-left origin).
  async addFields(
    documentId: string,
    fields: Field[],
    recipientIdByEmail: Record<string, string>,
    opts: { onApplied?: (idx: number) => void; startIndex?: number } = {},
  ): Promise<void> {
    if (fields.length === 0) return;
    if (!hasDocumensoCreds()) return;
    if (isLocalId(documentId)) return;
    const start = Math.max(0, opts.startIndex ?? 0);
    let idx = start;
    for (const field of fields.slice(start)) {
      const recipientId = recipientIdByEmail[field.recipientEmail.toLowerCase()];
      if (!recipientId) {
        throw new Error(
          `documenso.addFields: no recipientId for ${field.recipientEmail}`,
        );
      }
      const resp = await timedFetch(
        `${apiBase()}/documents/${encodeURIComponent(documentId)}/fields`,
        {
          method: "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({
            // Documenso expects a NUMERIC recipientId. We coerce here.
            recipientId: Number(recipientId),
            type: documensoFieldType(field.type),
            pageNumber: field.page,
            pageX: round2(field.x * 100),
            pageY: round2(field.y * 100),
            pageWidth: round2(field.width * 100),
            pageHeight: round2(field.height * 100),
            fieldMeta: {
              // Discriminator required by ZCreateFieldMutationSchema's
              // discriminated-union; without it, label/required are
              // rejected as unrecognized keys.
              type: documensoFieldMetaType(field.type),
              ...(field.label ? { label: field.label } : {}),
              ...(field.required !== undefined ? { required: field.required } : {}),
            },
          }),
        },
        "addFields",
      );
      await ensureOk(resp, "addFields");
      opts.onApplied?.(idx);
      idx += 1;
    }
  },

  async getDocument(documentId: string): Promise<DocumensoDocument> {
    if (!hasDocumensoCreds()) {
      return { status: "DRAFT", recipients: [] };
    }
    if (isLocalId(documentId)) {
      return { status: "DRAFT", recipients: [] };
    }
    const resp = await timedFetch(
      `${apiBase()}/documents/${encodeURIComponent(documentId)}`,
      { method: "GET", headers: authHeaders() },
      "getDocument",
    );
    await ensureOk(resp, "getDocument");
    const data = (await resp.json()) as {
      status?: string;
      completedAt?: string;
      recipients?: Array<{
        id?: string | number;
        email?: string;
        readStatus?: string;
        signingStatus?: string;
        sendStatus?: string;
        signedAt?: string;
        rejectionReason?: string;
      }>;
    };
    return {
      status: data.status ?? "DRAFT",
      completedAt: data.completedAt,
      recipients: (data.recipients ?? []).map((r) => ({
        email: r.email ?? "",
        recipientId: r.id !== undefined && r.id !== null ? String(r.id) : undefined,
        status: coalesceRecipientStatus(r.readStatus, r.signingStatus, r.sendStatus),
        signedAt: r.signedAt,
        rejectionReason: r.rejectionReason,
      })),
    };
  },

  // Cancel/void/delete a document — Documenso v1 has no separate cancel
  // verb; DELETE is used for both draft discard and in-flight cancel.
  // The `reason` option isn't part of the v1 contract so the server
  // ignores it; we still send it for audit-trail symmetry.
  async cancelDocument(
    documentId: string,
    opts: { reason?: string } = {},
  ): Promise<void> {
    if (!hasDocumensoCreds()) return;
    if (isLocalId(documentId)) return;
    const init: RequestInit = opts.reason
      ? {
          method: "DELETE",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ reason: opts.reason }),
        }
      : {
          method: "DELETE",
          headers: authHeaders(),
        };
    const resp = await timedFetch(
      `${apiBase()}/documents/${encodeURIComponent(documentId)}`,
      init,
      "cancelDocument",
    );
    await ensureOk(resp, "cancelDocument");
  },

  // Resend signing invitations. Documenso v1 REQUIRES a non-empty array
  // of recipient IDs — there is no "remind everyone still pending"
  // shortcut at the API level, so the caller must compute who to ping.
  async resendDocument(
    documentId: string,
    opts: { recipientIds: string[] },
  ): Promise<void> {
    if (!hasDocumensoCreds()) return;
    if (isLocalId(documentId)) return;
    if (opts.recipientIds.length === 0) {
      throw new Error(
        "documenso.resendDocument: at least one recipientId is required",
      );
    }
    const resp = await timedFetch(
      `${apiBase()}/documents/${encodeURIComponent(documentId)}/resend`,
      {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          // Documenso wants integer recipient IDs.
          recipients: opts.recipientIds.map((id) => Number(id)),
        }),
      },
      "resendDocument",
    );
    await ensureOk(resp, "resendDocument");
  },

  // ---------- Templates ----------------------------------------------

  async listTemplates(): Promise<TemplateRecord[]> {
    if (!hasDocumensoCreds()) {
      return STUB_TEMPLATES.map((t) => ({
        ...t,
        recipientRoles: t.recipientRoles.map((r) => ({ ...r })),
      }));
    }
    const resp = await timedFetch(
      `${apiBase()}/templates`,
      { method: "GET", headers: authHeaders() },
      "listTemplates",
    );
    await ensureOk(resp, "listTemplates");
    const data = (await resp.json()) as
      | RawTemplate[]
      | { templates?: RawTemplate[]; data?: RawTemplate[] };
    const rows: RawTemplate[] = Array.isArray(data)
      ? data
      : (data.templates ?? data.data ?? []);
    return rows.map(normaliseTemplate);
  },

  async getTemplate(templateId: string): Promise<TemplateRecord> {
    if (!hasDocumensoCreds()) {
      const stub = STUB_TEMPLATES.find((t) => t.id === templateId);
      if (!stub) throw new Error(`documenso.getTemplate: ${templateId} not found`);
      return { ...stub, recipientRoles: stub.recipientRoles.map((r) => ({ ...r })) };
    }
    const resp = await timedFetch(
      `${apiBase()}/templates/${encodeURIComponent(templateId)}`,
      { method: "GET", headers: authHeaders() },
      "getTemplate",
    );
    await ensureOk(resp, "getTemplate");
    const data = (await resp.json()) as RawTemplate;
    return normaliseTemplate(data);
  },

  // POST /api/v1/templates/:id/generate-document.
  //
  // Documenso v1 has TWO endpoints to make a document from a template
  // (`generate-document` and the legacy `create-document`). We use
  // `generate-document` per Documenso's own deprecation guidance — its
  // recipient mapping is by template-recipient ID, which is what we
  // store in TemplateRecord.recipientRoles[].id.
  async createDocumentFromTemplate(
    templateId: string,
    opts: {
      title: string;
      recipients: Array<{ roleId: string; name: string; email: string; signingOrder?: number }>;
      externalId?: string;
    },
  ): Promise<DocumensoCreateDocumentResult> {
    if (!hasDocumensoCreds()) {
      return {
        documentId: `LOCAL-${randSuffix()}`,
        recipients: opts.recipients.map((r) => ({
          email: r.email,
          recipientId: `LOCAL-rcpt-${randSuffix()}`,
        })),
      };
    }
    const resp = await timedFetch(
      `${apiBase()}/templates/${encodeURIComponent(templateId)}/generate-document`,
      {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          title: opts.title,
          ...(opts.externalId ? { externalId: opts.externalId } : {}),
          recipients: opts.recipients.map((r) => ({
            // Template recipient IDs are integers in Documenso.
            id: Number(r.roleId),
            email: r.email,
            ...(r.name ? { name: r.name } : {}),
            ...(typeof r.signingOrder === "number" ? { signingOrder: r.signingOrder } : {}),
          })),
        }),
      },
      "createDocumentFromTemplate",
    );
    await ensureOk(resp, "createDocumentFromTemplate");
    const data = (await resp.json()) as {
      documentId?: string | number;
      id?: string | number;
      recipients?: Array<{
        recipientId?: string | number;
        email?: string;
        signingUrl?: string;
      }>;
    };
    const documentId = asString(data.documentId ?? data.id);
    return {
      documentId,
      recipients: (data.recipients ?? []).map((r) => ({
        email: r.email ?? "",
        recipientId: asString(r.recipientId),
        signingUrl: r.signingUrl,
      })),
    };
  },

  // GET /documents/:id/download → { downloadUrl: <presigned S3 GET> }.
  // We follow the redirect ourselves and stream the bytes back to the
  // caller so they can persist or pipe the signed PDF.
  async downloadSignedPdf(documentId: string): Promise<Buffer> {
    if (!hasDocumensoCreds()) {
      throw new Error("no creds — cannot download signed PDF");
    }
    if (isLocalId(documentId)) {
      throw new Error(
        `documenso.downloadSignedPdf: ${documentId} is a local-only id; envelope was created in mock mode and has no signed PDF upstream`,
      );
    }
    const resp = await timedFetch(
      `${apiBase()}/documents/${encodeURIComponent(documentId)}/download`,
      { method: "GET", headers: authHeaders() },
      "downloadSignedPdf",
    );
    await ensureOk(resp, "downloadSignedPdf");
    const data = (await resp.json()) as { downloadUrl?: string };
    if (!data.downloadUrl) {
      throw new Error(
        "documenso.downloadSignedPdf: response missing downloadUrl",
      );
    }
    const pdfResp = await timedFetch(
      data.downloadUrl,
      { method: "GET" },
      "downloadSignedPdf.fetchPdf",
    );
    if (!pdfResp.ok) {
      const snippet = await pdfResp.text().catch(() => "<unreadable>");
      throw new DocumensoHttpError(
        pdfResp.status,
        `documenso.downloadSignedPdf.fetchPdf: HTTP ${pdfResp.status} ${pdfResp.statusText} — ${snippet.slice(0, 200)}`,
        snippet.slice(0, 200),
      );
    }
    const ab = await pdfResp.arrayBuffer();
    return Buffer.from(ab);
  },
};

// ---------- Webhook verification + parsing ----------------------------
//
// Documenso webhooks are NOT HMAC-signed. The operator-configured secret
// is sent verbatim in the `X-Documenso-Secret` header on every delivery
// (see packages/lib/server-only/webhooks/execute-webhook-call.ts on
// documenso/main). We do a constant-time string compare against
// DOCUMENSO_WEBHOOK_SECRET.

export function verifyWebhookSecret(headerValue: string | undefined): boolean {
  const secret = DOCUMENSO_WEBHOOK_SECRET();
  if (!secret || !headerValue) return false;
  const a = Buffer.from(secret, "utf8");
  const b = Buffer.from(headerValue, "utf8");
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// Back-compat alias for the now-misnamed HMAC verifier. The shape is
// the same (string in → boolean out) but the semantics are plain-secret.
export function verifyWebhookSignature(
  _rawBody: string,
  headerValue: string | undefined,
): boolean {
  return verifyWebhookSecret(headerValue);
}

export function parseWebhookEvent(rawBody: string): DocumensoEvent {
  const parsed: unknown = JSON.parse(rawBody);
  return DocumensoEventSchema.parse(parsed);
}

// ---------- Status mapping --------------------------------------------
//
// Documenso v1 has 4 document statuses: DRAFT, PENDING, COMPLETED, REJECTED.
// We map them conservatively — PENDING covers everything from
// "just sent" through "partially-signed", so we return 'sent' and let
// the recipient-mix derivation in lib/esign.ts#recomputeEnvelopeStatus
// refine it further.
//
// CANCELLED and EXPIRED don't exist as document statuses — they only
// appear as webhook events (DOCUMENT_CANCELLED, RECIPIENT_EXPIRED). The
// local state machine surfaces them via our own 'voided' / 'expired'
// statuses, written from the webhook handler, NOT from this mapper.

export function mapDocumensoStatusToEnvelopeStatus(
  documensoStatus: string,
): EnvelopeStatus {
  switch (documensoStatus.toUpperCase()) {
    case "DRAFT":
      return "draft";
    case "PENDING":
      return "sent";
    case "COMPLETED":
      return "completed";
    case "REJECTED":
      return "declined";
    default:
      return "sent";
  }
}
