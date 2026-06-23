// One-off bootstrap: grant ADMIN role + the restricted financial privileges
// (financials.view, billing.treasury_view) to specific users.
//
// Needed because these can't be done in the app UI: nothing outranks ADMIN
// (so ADMIN promotion is escalation-proof) and you can't grant a restricted
// privilege you don't already hold. This writes directly to the DB.
//
// Usage (DATABASE_URL must point at the prod DB, e.g. via the Cloud SQL Auth
// Proxy on 127.0.0.1:5432):
//
//   node scripts/grant-admin-financials.mjs darkswapdev darkswapfoundation sean
//        → DRY RUN: prints the users it matched and what it would change.
//   node scripts/grant-admin-financials.mjs darkswapdev darkswapfoundation sean --apply
//        → applies the changes.
//
// Matching is case-insensitive "contains" against BOTH email and name, so the
// handles above resolve whether they're the email local-part or the display
// name. If a handle matches 0 or >1 users it is reported and SKIPPED (never
// guesses) — pass a more specific identifier (e.g. a full email) for those.

import { PrismaClient } from "@prisma/client"

const EXTRA_PRIVILEGES = ["financials.view", "billing.treasury_view"]
const TARGET_ROLE = "ADMIN"

const args = process.argv.slice(2)
const apply = args.includes("--apply")
const handles = args.filter((a) => a !== "--apply")

if (handles.length === 0) {
  console.error("Usage: node scripts/grant-admin-financials.mjs <handle> [handle...] [--apply]")
  process.exit(1)
}

const prisma = new PrismaClient()

function uniq(arr) {
  return [...new Set(arr)]
}

async function main() {
  console.log(`Mode: ${apply ? "APPLY" : "DRY RUN (pass --apply to write)"}`)
  console.log(`Target role: ${TARGET_ROLE}  ·  extra privileges: ${EXTRA_PRIVILEGES.join(", ")}\n`)

  const resolved = new Map() // userId -> user (dedupe across handles)
  for (const handle of handles) {
    const matches = await prisma.user.findMany({
      where: {
        OR: [
          { email: { contains: handle, mode: "insensitive" } },
          { name: { contains: handle, mode: "insensitive" } },
        ],
      },
      select: { id: true, email: true, name: true, role: true, privileges: true, active: true },
    })
    if (matches.length === 0) {
      console.log(`✗ "${handle}" — no user matched. SKIPPED.`)
      continue
    }
    if (matches.length > 1) {
      console.log(`✗ "${handle}" — matched ${matches.length} users; too ambiguous, SKIPPED:`)
      for (const m of matches) console.log(`    - ${m.email} (${m.name ?? "—"})`)
      continue
    }
    const u = matches[0]
    console.log(`✓ "${handle}" → ${u.email} (${u.name ?? "—"}) · role ${u.role}${u.active ? "" : " · INACTIVE"}`)
    resolved.set(u.id, u)
  }

  if (resolved.size === 0) {
    console.log("\nNothing to do.")
    return
  }

  console.log("\nPlanned changes:")
  const updates = []
  for (const u of resolved.values()) {
    const nextPrivileges = uniq([...(u.privileges ?? []), ...EXTRA_PRIVILEGES])
    const addedPrivs = nextPrivileges.filter((p) => !(u.privileges ?? []).includes(p))
    const roleChange = u.role !== TARGET_ROLE ? `${u.role} → ${TARGET_ROLE}` : "(already ADMIN)"
    console.log(`  ${u.email}: role ${roleChange}; +privileges [${addedPrivs.join(", ") || "none"}]`)
    if (u.role !== TARGET_ROLE || addedPrivs.length > 0) {
      updates.push({ id: u.id, email: u.email, data: { role: TARGET_ROLE, privileges: nextPrivileges } })
    }
  }

  if (!apply) {
    console.log("\nDRY RUN — no changes written. Re-run with --apply to commit.")
    return
  }
  if (updates.length === 0) {
    console.log("\nAll target users already have the role + privileges. No writes needed.")
    return
  }

  console.log("\nApplying…")
  for (const up of updates) {
    await prisma.user.update({ where: { id: up.id }, data: up.data })
    console.log(`  ✓ ${up.email} updated`)
  }
  console.log(`\nDone — ${updates.length} user(s) updated.`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
