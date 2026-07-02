// Controlled document-type taxonomy for the Documents drive.
//
// One PRIMARY type per file (DriveFile.docType), from this fine-grained list, so
// the drive can be browsed/filtered by what a document actually is. Secondary
// detail (execution status, themes, counterparties, year) lives in
// DriveFile.docStatus + DriveFile.tags. Shared by the classifier agents
// (scripts/classify-*), the write-back validator, and the admin UI so the slugs
// never drift.

export type DocTypeDef = { slug: string; label: string; group: string }

export const DOC_TYPE_GROUPS = [
  "Corporate & Formation",
  "Governance",
  "Equity & People",
  "Financing",
  "Finance & Tax",
  "Compliance & Ops",
] as const
export type DocTypeGroup = (typeof DOC_TYPE_GROUPS)[number]

export const DOC_TYPES: DocTypeDef[] = [
  // Corporate & Formation
  { slug: "certificate_incorporation", label: "Certificate of Incorporation", group: "Corporate & Formation" },
  { slug: "charter_amendment", label: "Charter Amendment", group: "Corporate & Formation" },
  { slug: "bylaws", label: "Bylaws", group: "Corporate & Formation" },
  { slug: "certificate_secretary", label: "Certificate of Secretary", group: "Corporate & Formation" },
  { slug: "corporate_policy", label: "Corporate Policy", group: "Corporate & Formation" },
  { slug: "formation_filing", label: "Formation Filing / EIN", group: "Corporate & Formation" },
  // Governance
  { slug: "board_consent", label: "Board Consent", group: "Governance" },
  { slug: "stockholder_consent", label: "Stockholder Consent", group: "Governance" },
  { slug: "director_action", label: "Sole Director / Incorporator Action", group: "Governance" },
  // Equity & People
  { slug: "equity_incentive_plan", label: "Equity Incentive Plan", group: "Equity & People" },
  { slug: "restricted_stock", label: "Restricted Stock (RSPA/RSA)", group: "Equity & People" },
  { slug: "stock_option", label: "Stock Option Grant", group: "Equity & People" },
  { slug: "advisor_agreement", label: "Advisor Agreement", group: "Equity & People" },
  { slug: "employment_agreement", label: "Employment / Contractor Agreement", group: "Equity & People" },
  { slug: "indemnification_agreement", label: "Indemnification Agreement", group: "Equity & People" },
  { slug: "cap_table", label: "Cap Table", group: "Equity & People" },
  // Financing
  { slug: "safe", label: "SAFE", group: "Financing" },
  { slug: "safe_side_letter", label: "SAFE Side Letter / Amendment", group: "Financing" },
  { slug: "token_warrant", label: "Token Warrant", group: "Financing" },
  { slug: "token_rights", label: "Token Rights Agreement", group: "Financing" },
  { slug: "warrant", label: "Warrant (equity)", group: "Financing" },
  { slug: "subscription_agreement", label: "Subscription Agreement", group: "Financing" },
  // Finance & Tax
  { slug: "valuation_409a", label: "Valuation / 409A Report", group: "Finance & Tax" },
  { slug: "valuation_data", label: "Valuation Data / Comps", group: "Finance & Tax" },
  { slug: "tax_form", label: "Tax Form (W-9 / W-8 / BIR)", group: "Finance & Tax" },
  { slug: "tax_filing", label: "Tax Return / Filing", group: "Finance & Tax" },
  { slug: "invoice", label: "Invoice", group: "Finance & Tax" },
  { slug: "payment_receipt", label: "Payment / Receipt", group: "Finance & Tax" },
  { slug: "banking", label: "Banking / Treasury", group: "Finance & Tax" },
  // Compliance & Ops
  { slug: "nda", label: "NDA / Confidentiality", group: "Compliance & Ops" },
  { slug: "compliance_kyc", label: "Compliance / KYC-AML", group: "Compliance & Ops" },
  { slug: "identity_verification", label: "Identity / Verification", group: "Compliance & Ops" },
  { slug: "report_memo", label: "Report / Memo", group: "Compliance & Ops" },
  { slug: "correspondence", label: "Correspondence / Email", group: "Compliance & Ops" },
  { slug: "template", label: "Template (blank)", group: "Compliance & Ops" },
  { slug: "media_asset", label: "Image / Media Asset", group: "Compliance & Ops" },
  { slug: "other", label: "Other / Uncategorized", group: "Compliance & Ops" },
]

export const DOC_TYPE_SLUGS: string[] = DOC_TYPES.map((d) => d.slug)
export const DOC_TYPE_LABEL: Record<string, string> = Object.fromEntries(DOC_TYPES.map((d) => [d.slug, d.label]))
export const DOC_TYPE_GROUP: Record<string, string> = Object.fromEntries(DOC_TYPES.map((d) => [d.slug, d.group]))
export const isDocType = (s: unknown): s is string => typeof s === "string" && DOC_TYPE_SLUGS.includes(s)

// Execution status — a document's signature state, orthogonal to its type.
export const DOC_STATUSES: DocTypeDef[] = [
  { slug: "executed", label: "Executed", group: "" },
  { slug: "partially_executed", label: "Partially executed", group: "" },
  { slug: "unsigned", label: "Unsigned", group: "" },
  { slug: "draft", label: "Draft", group: "" },
  { slug: "template", label: "Template", group: "" },
  { slug: "void", label: "Void", group: "" },
  { slug: "na", label: "N/A", group: "" },
]
export const DOC_STATUS_SLUGS: string[] = DOC_STATUSES.map((s) => s.slug)
export const DOC_STATUS_LABEL: Record<string, string> = Object.fromEntries(DOC_STATUSES.map((s) => [s.slug, s.label]))
export const isDocStatus = (s: unknown): s is string => typeof s === "string" && DOC_STATUS_SLUGS.includes(s)
