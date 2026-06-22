import prisma from "@/lib/prisma"
import { LEGACY_PRIVILEGE_MAP, type Privilege } from "@/lib/cms/privileges"

/** Expande grants legados grossos no granular e remove o legado; idempotente. */
export function expandGrants(privileges: string[]): string[] {
  const out: string[] = []
  for (const p of privileges) {
    const mapped = LEGACY_PRIVILEGE_MAP[p as Privilege]
    if (mapped) out.push(...mapped)
    else out.push(p)
  }
  return [...new Set(out)]
}

async function main() {
  const dry = process.argv.includes("--dry")
  const legacyKeys = Object.keys(LEGACY_PRIVILEGE_MAP)
  const users = await prisma.user.findMany({ where: { privileges: { hasSome: legacyKeys as Privilege[] } } })
  console.log(`${users.length} user(s) com grants legados${dry ? " (dry-run)" : ""}`)
  for (const u of users) {
    const next = expandGrants(u.privileges)
    console.log(`  ${u.email}: [${u.privileges.join(", ")}] → [${next.join(", ")}]`)
    if (!dry) {
      await prisma.user.update({ where: { id: u.id }, data: { privileges: next as Privilege[] } })
    }
  }
  console.log(dry ? "dry-run completo (nada gravado)" : "backfill aplicado")
}

// Só roda quando invocado direto (não em import de teste).
if (process.argv[1]?.includes("backfill-granular-privileges")) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
}
