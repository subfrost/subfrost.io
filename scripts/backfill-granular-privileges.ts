import prisma from "@/lib/prisma"
import { resolveCode } from "@/lib/cms/iam/registry"

/** Normaliza códigos legados (enum FUEL_EDIT, MANAGE_USERS, …) para os códigos
 *  pontilhados do registro IAM (fuel.edit, iam.*). Pass-through p/ códigos já
 *  novos; de-dupa; descarta desconhecidos. Não fecha sobre `implies` — o
 *  fechamento acontece em effectivePrivileges na leitura, então o grant
 *  armazenado fica mínimo e editável. */
export function expandGrants(codes: string[]): string[] {
  return [...new Set(codes.flatMap(resolveCode))]
}

async function main() {
  const dry = process.argv.includes("--dry")

  const users = await prisma.user.findMany({ select: { id: true, email: true, privileges: true } })
  let cu = 0
  for (const u of users) {
    const next = expandGrants(u.privileges)
    if (JSON.stringify(next) !== JSON.stringify(u.privileges)) {
      cu++
      console.log(`  user ${u.email}: [${u.privileges.join(", ")}] → [${next.join(", ")}]`)
      if (!dry) await prisma.user.update({ where: { id: u.id }, data: { privileges: next } })
    }
  }

  const keys = await prisma.apiKey.findMany({ select: { id: true, prefix: true, scopes: true } })
  let ck = 0
  for (const k of keys) {
    const next = expandGrants(k.scopes)
    if (JSON.stringify(next) !== JSON.stringify(k.scopes)) {
      ck++
      console.log(`  key ${k.prefix}…: [${k.scopes.join(", ")}] → [${next.join(", ")}]`)
      if (!dry) await prisma.apiKey.update({ where: { id: k.id }, data: { scopes: next } })
    }
  }

  console.log(`${cu} user(s), ${ck} key(s) ${dry ? "mudariam (dry-run)" : "atualizados"}`)
}

// Só roda quando invocado direto (não em import de teste).
if (process.argv[1]?.includes("backfill-granular-privileges")) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
}
