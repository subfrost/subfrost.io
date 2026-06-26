import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import prisma from "@/lib/prisma"
import { AdminEditor } from "@/components/cms/AdminEditor"

export const dynamic = "force-dynamic"

const empty = { title: "", excerpt: "", body: "" }

export default async function NewArticlePage() {
  const user = await currentUser()
  // The edge middleware only verifies the JWT signature and defers full auth to
  // here, so a stale-but-signed session (legacy token, bumped tokenVersion,
  // revoked session) lands here with no user. Redirect to login instead of
  // rendering the editor with no real session — matches the guard every other
  // /admin page already has.
  if (!user) redirect("/admin/login")
  const canPublish = user.privileges.includes("articles.publish")
  const members = await prisma.user.findMany({
    where: { active: true, id: { not: user.id } },
    orderBy: [{ name: "asc" }, { email: "asc" }],
    select: { id: true, name: true, email: true },
  })

  return (
    <AdminEditor
      canPublish={canPublish}
      initial={{ slug: "", coverImage: "", tags: [], featured: false, primaryLocale: "en", status: "DRAFT", en: empty, zh: empty }}
      members={members.map((member) => ({ id: member.id, name: member.name ?? member.email }))}
    />
  )
}
