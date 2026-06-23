// Shared UI helpers for the Sign & Send (/documents) section.
//
// Status tag colors, human-readable labels, and small derivation helpers
// used by both the inbox and detail page so visual treatment stays
// consistent across the section.

import type {
  EnvelopeRecord,
  EnvelopeStatus,
  RecipientStatus,
} from "./types";

export type Tone = "ok" | "bad" | "info" | "warn";

export const ENVELOPE_STATUS_LABELS: Record<EnvelopeStatus, string> = {
  draft: "Draft",
  uploaded: "Uploaded",
  sent: "Sent",
  viewed: "Viewed",
  "partially-signed": "Partially signed",
  completed: "Completed",
  declined: "Declined",
  voided: "Voided",
  expired: "Expired",
};

export function statusTone(s: EnvelopeStatus): Tone {
  switch (s) {
    case "completed":
      return "ok";
    case "voided":
    case "declined":
    case "expired":
      return "bad";
    case "sent":
    case "viewed":
    case "partially-signed":
      return "info";
    case "draft":
    case "uploaded":
    default:
      return "warn";
  }
}

export function recipientStatusTone(s: RecipientStatus): Tone {
  switch (s) {
    case "signed":
      return "ok";
    case "declined":
      return "bad";
    case "viewed":
      return "info";
    case "pending":
    default:
      return "warn";
  }
}

// Coarse-grained groupings used for the inbox filter chips. "in flight"
// covers everything between dispatch and a terminal state so operators
// can see "what's currently waiting on people" at a glance.
export type FilterBucket = "all" | "in-flight" | "completed" | "drafts" | "blocked";

export const FILTER_LABELS: Record<FilterBucket, string> = {
  all: "All",
  "in-flight": "In flight",
  completed: "Completed",
  drafts: "Drafts",
  blocked: "Blocked",
};

export function inBucket(env: EnvelopeRecord, bucket: FilterBucket): boolean {
  switch (bucket) {
    case "all":
      return true;
    case "completed":
      return env.status === "completed";
    case "drafts":
      return env.status === "draft" || env.status === "uploaded";
    case "blocked":
      return (
        env.status === "declined" ||
        env.status === "voided" ||
        env.status === "expired"
      );
    case "in-flight":
      return (
        env.status === "sent" ||
        env.status === "viewed" ||
        env.status === "partially-signed"
      );
  }
}

export function envelopeProgress(env: EnvelopeRecord): {
  signed: number;
  total: number;
  pct: number;
} {
  // Defensive ?? [] because old JSON-store rows from before the schema
  // tightening sometimes have recipients=undefined. Without this guard
  // the inbox page crashes on render.
  const recipients = env.recipients ?? [];
  const total = recipients.length;
  const signed = recipients.filter((r) => r.status === "signed").length;
  return { signed, total, pct: total === 0 ? 0 : Math.round((signed / total) * 100) };
}

// Search match — case-insensitive substring across subject, recipient
// name/email, kind label, and external id. Empty query matches anything.
export function matchesSearch(env: EnvelopeRecord, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  if ((env.subject ?? "").toLowerCase().includes(needle)) return true;
  if ((env.kind ?? "").toLowerCase().includes(needle)) return true;
  if (env.externalDocumentId?.toLowerCase().includes(needle)) return true;
  for (const r of env.recipients ?? []) {
    if ((r.name ?? "").toLowerCase().includes(needle)) return true;
    if ((r.email ?? "").toLowerCase().includes(needle)) return true;
  }
  return false;
}

// Returns true when expiresAt is within the next 24 hours (and still in
// the future). Same threshold the detail page uses to surface the
// "expires soon" banner.
export function within24hOfExpiry(expiresAt: string | undefined): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  if (Number.isNaN(t)) return false;
  const now = Date.now();
  return t > now && t - now < 24 * 60 * 60 * 1000;
}

export function envelopeIsTerminal(env: EnvelopeRecord): boolean {
  return (
    env.status === "completed" ||
    env.status === "voided" ||
    env.status === "declined" ||
    env.status === "expired"
  );
}

export function envelopeIsSendable(env: EnvelopeRecord): boolean {
  return env.status === "draft" || env.status === "uploaded";
}

export function envelopeIsInFlight(env: EnvelopeRecord): boolean {
  return (
    env.status === "sent" ||
    env.status === "viewed" ||
    env.status === "partially-signed"
  );
}
