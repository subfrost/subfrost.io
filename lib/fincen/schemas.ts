// BSA E-Filing — pure, client-safe schema module.
//
// Ported verbatim from subfrost-admin/apps/admin-web/src/lib/bsa.ts (lines 14,
// 27–139, 274–377, 379–410). No prisma, no node:*, no ./store imports.

import { z } from "zod";

// ---------- Schemas ----------------------------------------------------

const Address = z.object({
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().length(2),
  zip: z.string().min(5),
});

const Officer = z.object({
  name: z.string().min(1),
  title: z.string().min(1),
  role: z.enum(["director", "secretary", "compliance", "ceo", "other"]),
  includeOnFiling: z.boolean().default(true),
  dobYyyyMmDd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ssnLast4: z.string().regex(/^\d{4}$/).optional(),
  phone: z.string().optional(),
  address: Address.optional(),
});

const Owner = z.object({
  name: z.string().min(1),
  dobYyyyMmDd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ssnLast4: z.string().regex(/^\d{4}$/).optional(),
  phone: z.string().optional(),
  address: Address.optional(),
  ownershipPct: z.number().min(0).max(100).optional(),
});

export const Form107Schema = z.object({
  legalName: z.string().min(1),
  dbaNames: z.array(z.string()).default([]),
  ein: z.string().regex(/^\d{2}-?\d{7}$/),
  // FinCEN wants the date the MSB started business (cert of incorporation date for new entities).
  dateBusinessStarted: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  formOfOrganization: z.enum(["sole-prop", "partnership", "corporation", "llc", "other"]).default("corporation"),
  stateOfOrganization: z.string().length(2).default("TX"),
  principalAddress: Address,
  mailingAddress: Address.optional(),
  businessPhone: z.string().optional(),
  geography: z.literal("US"),
  msbActivities: z.array(
    z.enum([
      "money-transmitter",
      "provider-of-prepaid-access",
      "currency-dealer-or-exchanger",
      "issuer-of-monetary-instruments",
      "check-casher",
      "seller-of-monetary-instruments",
      "us-postal-service-money-orders",
    ]),
  ).default([]),
  // States where MSB activities will be conducted. 2-letter codes. The
  // FinCEN portal also has a "conducts business in all states" checkbox —
  // we model that as a separate flag so the state-list stays strictly
  // 2-letter codes.
  conductsBusinessInAllStates: z.boolean().default(false),
  statesOfActivity: z.array(z.string().length(2)).default([]),
  numberOfBranches: z.number().int().nonnegative().default(0),
  numberOfAgents: z.number().int().nonnegative().default(0),
  primaryRegulator: z.enum(["irs", "occ", "frb", "fdic", "state-only"]).default("irs"),
  estimatedAnnualTxnCount: z.number().int().nonnegative().optional(),
  estimatedAnnualTxnVolumeUsd: z.number().int().nonnegative().optional(),
  officers: z.array(Officer).min(1),
  // Owners (>25% beneficial). FinCEN requires this disclosure separately
  // from officers — even when the same person fills both roles.
  owners: z.array(Owner).default([]),
  reasonForFiling: z.enum(["initial", "renewal", "amendment", "deregistration"]).default("initial"),
  preparerName: z.string().min(1),
});

export type Form107 = z.infer<typeof Form107Schema>;

export const SarSchema = z.object({
  subject: z.object({
    name: z.string().min(1),
    alias: z.string().optional(),
    address: Address.optional(),
    accountId: z.string().optional(),
  }),
  activity: z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    totalUsd: z.number().int().nonnegative(),
    category: z.enum([
      "structuring",
      "money-laundering",
      "terrorist-financing",
      "fraud",
      "identity-theft",
      "other",
    ]),
  }),
  narrative: z.string().min(40, "narrative must be substantive (40+ chars)"),
  preparerName: z.string().min(1),
});

export type Sar = z.infer<typeof SarSchema>;

export const CtrSchema = z.object({
  subject: z.object({
    name: z.string().min(1),
    accountId: z.string().min(1),
    address: Address,
  }),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cashIn: z.number().int().nonnegative(),
  cashOut: z.number().int().nonnegative(),
  preparerName: z.string().min(1),
}).refine((d) => d.cashIn + d.cashOut > 10_000, {
  message: "CTR only applies to cash transactions over $10,000",
});

export type Ctr = z.infer<typeof CtrSchema>;

// ---------- XML serialization (Form 107) -------------------------------
//
// This is a hand-rolled best-effort serializer based on FinCEN's public
// Form 107 layout. Once we ingest FinCEN's published XSD into the build,
// swap this for an XSD-validated generator. The schema name and element
// names below are stable enough for human review of drafts; the real
// submission will revalidate.

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function xmlAddress(tag: string, a: z.infer<typeof Address>): string {
  return [
    `<${tag}>`,
    `  <AddressLine1>${esc(a.line1)}</AddressLine1>`,
    a.line2 ? `  <AddressLine2>${esc(a.line2)}</AddressLine2>` : "",
    `  <City>${esc(a.city)}</City>`,
    `  <State>${esc(a.state)}</State>`,
    `  <ZIP>${esc(a.zip)}</ZIP>`,
    `</${tag}>`,
  ].filter(Boolean).join("\n");
}

export function form107ToXml(draft: Form107): string {
  const officers = draft.officers
    .filter((o) => o.includeOnFiling)
    .map((o) =>
      [
        `  <Officer>`,
        `    <Name>${esc(o.name)}</Name>`,
        `    <Title>${esc(o.title)}</Title>`,
        `    <Role>${esc(o.role)}</Role>`,
        o.dobYyyyMmDd ? `    <DateOfBirth>${o.dobYyyyMmDd}</DateOfBirth>` : "",
        o.ssnLast4 ? `    <SSNLast4>${o.ssnLast4}</SSNLast4>` : "",
        o.phone ? `    <Phone>${esc(o.phone)}</Phone>` : "",
        o.address ? "    " + xmlAddress("Address", o.address).replace(/\n/g, "\n    ") : "",
        `  </Officer>`,
      ].filter(Boolean).join("\n"),
    )
    .join("\n");

  const owners = draft.owners
    .map((o) =>
      [
        `  <Owner>`,
        `    <Name>${esc(o.name)}</Name>`,
        o.ownershipPct !== undefined ? `    <OwnershipPct>${o.ownershipPct}</OwnershipPct>` : "",
        o.dobYyyyMmDd ? `    <DateOfBirth>${o.dobYyyyMmDd}</DateOfBirth>` : "",
        o.ssnLast4 ? `    <SSNLast4>${o.ssnLast4}</SSNLast4>` : "",
        o.phone ? `    <Phone>${esc(o.phone)}</Phone>` : "",
        o.address ? "    " + xmlAddress("Address", o.address).replace(/\n/g, "\n    ") : "",
        `  </Owner>`,
      ].filter(Boolean).join("\n"),
    )
    .join("\n");

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<Form107 xmlns="https://www.fincen.gov/schema/msb/registration"`,
    `         reasonForFiling="${draft.reasonForFiling}">`,
    `  <LegalName>${esc(draft.legalName)}</LegalName>`,
    draft.dbaNames.length
      ? `  <DBANames>\n${draft.dbaNames.map((d) => `    <DBA>${esc(d)}</DBA>`).join("\n")}\n  </DBANames>`
      : "",
    `  <EIN>${esc(draft.ein)}</EIN>`,
    draft.dateBusinessStarted ? `  <DateBusinessStarted>${draft.dateBusinessStarted}</DateBusinessStarted>` : "",
    `  <FormOfOrganization>${draft.formOfOrganization}</FormOfOrganization>`,
    `  <StateOfOrganization>${draft.stateOfOrganization}</StateOfOrganization>`,
    `  ${xmlAddress("PrincipalAddress", draft.principalAddress).replace(/\n/g, "\n  ")}`,
    draft.mailingAddress
      ? `  ${xmlAddress("MailingAddress", draft.mailingAddress).replace(/\n/g, "\n  ")}`
      : "",
    draft.businessPhone ? `  <BusinessPhone>${esc(draft.businessPhone)}</BusinessPhone>` : "",
    `  <Geography>${draft.geography}</Geography>`,
    `  <MSBActivities>\n${
      draft.msbActivities.map((a) => `    <Activity>${a}</Activity>`).join("\n")
    }\n  </MSBActivities>`,
    draft.conductsBusinessInAllStates
      ? `  <StatesOfActivity all="true"/>`
      : draft.statesOfActivity.length
        ? `  <StatesOfActivity>\n${draft.statesOfActivity.map((s) => `    <State>${s}</State>`).join("\n")}\n  </StatesOfActivity>`
        : "",
    `  <NumberOfBranches>${draft.numberOfBranches}</NumberOfBranches>`,
    `  <NumberOfAgents>${draft.numberOfAgents}</NumberOfAgents>`,
    `  <PrimaryRegulator>${draft.primaryRegulator}</PrimaryRegulator>`,
    draft.estimatedAnnualTxnCount !== undefined
      ? `  <EstimatedAnnualTxnCount>${draft.estimatedAnnualTxnCount}</EstimatedAnnualTxnCount>`
      : "",
    draft.estimatedAnnualTxnVolumeUsd !== undefined
      ? `  <EstimatedAnnualTxnVolumeUsd>${draft.estimatedAnnualTxnVolumeUsd}</EstimatedAnnualTxnVolumeUsd>`
      : "",
    `  <Officers>`,
    officers,
    `  </Officers>`,
    draft.owners.length
      ? `  <Owners>\n${owners}\n  </Owners>`
      : "",
    `  <PreparerName>${esc(draft.preparerName)}</PreparerName>`,
    `</Form107>`,
  ].filter(Boolean).join("\n");
}

// Convenience: validate then serialize.
export function validateAndSerializeForm107(input: unknown): { xml: string; data: Form107 } {
  const data = Form107Schema.parse(input);
  return { xml: form107ToXml(data), data };
}

// ---------- Canonical defaults ----------------------------------------

export const FORM_107_DEFAULTS: Form107 = {
  legalName: "Subzero Research Inc.",
  dbaNames: [],
  ein: "99-1852777",
  formOfOrganization: "corporation",
  stateOfOrganization: "DE",
  principalAddress: {
    line1: "1300 Fairview Avenue",
    line2: "Unit E",
    city: "Houston",
    state: "TX",
    zip: "77006",
  },
  geography: "US",
  msbActivities: ["money-transmitter", "provider-of-prepaid-access"],
  conductsBusinessInAllStates: true,
  statesOfActivity: [],
  numberOfBranches: 0,
  numberOfAgents: 0,
  primaryRegulator: "irs",
  officers: [
    { name: "Raymond Wesley Pulver IV", title: "Sole Director / President / CEO", role: "director", includeOnFiling: true },
    { name: "Sean Christopher Pulver", title: "AML Compliance Officer", role: "compliance", includeOnFiling: true },
  ],
  owners: [
    { name: "Raymond Wesley Pulver IV", ownershipPct: 100 },
  ],
  reasonForFiling: "initial",
  preparerName: "Sean Christopher Pulver",
};
