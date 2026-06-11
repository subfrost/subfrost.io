import { PrismaClient, Role } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

// Bootstrap the first admin from env. Idempotent: re-running updates the
// password if BOOTSTRAP_ADMIN_PASSWORD changed, otherwise leaves it alone.
async function main() {
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || "").toLowerCase()
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || ""
  const name = process.env.BOOTSTRAP_ADMIN_NAME || "SUBFROST Admin"

  if (!email || !password) {
    console.log("[seed] BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD not set — skipping admin seed")
  } else {
    const passwordHash = await bcrypt.hash(password, 12)
    const user = await prisma.user.upsert({
      where: { email },
      update: { passwordHash, role: Role.ADMIN, active: true, name },
      create: { email, passwordHash, role: Role.ADMIN, active: true, name },
    })
    console.log(`[seed] admin ready: ${user.email} (${user.role})`)
  }

  // A couple of default tags so the editor has something to pick from.
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

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
