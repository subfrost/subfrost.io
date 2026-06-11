import { PrismaClient, Role } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

// Seeds CMS users (admin + authors) and default tags. Passwords are read from
// env (one per user) so this is safe to re-run; missing ones are skipped.
async function upsertUser(email: string, name: string, role: Role, password: string | undefined) {
  if (!password) {
    console.log(`[seed] no password for ${email} — skipping`)
    return
  }
  const passwordHash = await bcrypt.hash(password, 12)
  const u = await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    update: { role, active: true, name, passwordHash },
    create: { email: email.toLowerCase(), name, role, active: true, passwordHash },
  })
  console.log(`[seed] ${u.email} (${u.role})`)
}

async function main() {
  await upsertUser(process.env.SEED_ADMIN_EMAIL!, "Ashik", Role.ADMIN, process.env.SEED_ADMIN_PW)
  await upsertUser("rwp@subfrost.io", "RWP", Role.AUTHOR, process.env.SEED_RWP_PW)
  await upsertUser("gabe@subfrost.io", "Gabe", Role.AUTHOR, process.env.SEED_GABE_PW)

  for (const t of [
    { slug: "subfrost", name: "SUBFROST" },
    { slug: "frbtc", name: "frBTC" },
    { slug: "bitcoin", name: "Bitcoin" },
    { slug: "alkanes", name: "Alkanes" },
    { slug: "research", name: "Research" },
  ]) {
    await prisma.tag.upsert({ where: { slug: t.slug }, update: {}, create: t })
  }
  console.log("[seed] default tags ensured")
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
