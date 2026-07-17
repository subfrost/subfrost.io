// The SEED for the five BSA program pillars. The pillar rows are seeded from
// PROGRAM_PILLARS into ComplianceProgramItem once, then edited in the UI
// (lib/compliance/program-store.ts). The program's identity/registration facts
// (legal entity, BSA ID, tracking, compliance officer) live in a DB-backed,
// UI-editable singleton — see lib/compliance/register.ts — so the confidential
// values stay out of this PUBLIC repo. The seed pillar/obligation text is a
// generic best-practice template; real company-specific status and detail are
// entered through the admin UI (stored in the database) after deploy.

export type PillarStatus = "OK" | "PARTIAL" | "GAP"

// Client-safe (this module imports no prisma/node) so the ProgramManager can use
// it for the status dropdown without pulling the server store into the bundle.
export const PILLAR_STATUSES: PillarStatus[] = ["OK", "PARTIAL", "GAP"]

export interface ProgramPillar {
  key: string
  title: string
  status: PillarStatus
  detail: string
  action?: string
}

// The five things a registered MSB must maintain (registration + the four BSA
// pillars). Seeded as a generic template with an unverified (GAP) default; set
// the real status and detail per your program in the admin UI. Drives the
// "needs attention" list on the overview once real statuses are entered.
export const PROGRAM_PILLARS: ProgramPillar[] = [
  {
    key: "msb-registration",
    title: "MSB registration (FinCEN Form 107)",
    status: "GAP",
    detail: "Registration with FinCEN as a money services business (Form 107), with the BSA ID on record. Renewal is required every two years and on any ownership/control change.",
    action: "Confirm registration is active and record the BSA ID (via the environment).",
  },
  {
    key: "written-program",
    title: "Written AML/BSA program",
    status: "GAP",
    detail: "A written AML/BSA program adopted by the board, with a manual covering CIP, OFAC screening, SAR/CTR triggers, and recordkeeping.",
    action: "Finalize the manual and attach it to the adopting board consent.",
  },
  {
    key: "compliance-officer",
    title: "Designated compliance officer",
    status: "GAP",
    detail: "A designated AML/BSA compliance officer of record, responsible for the program.",
    action: "Confirm the officer designation is documented.",
  },
  {
    key: "employee-training",
    title: "Employee training",
    status: "GAP",
    detail: "Recurring AML/BSA training for anyone who touches regulated flows, with attendance records retained.",
    action: "Schedule annual training and keep attendance records.",
  },
  {
    key: "independent-review",
    title: "Independent review",
    status: "GAP",
    detail: "A periodic independent review of the program by a qualified reviewer. Share access with a scoped, read-only Reviewer link (no platform account needed).",
    action: "Name the independent reviewer and calendar an annual review.",
  },
]
