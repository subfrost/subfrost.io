import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { AdminEditor } from "@/components/cms/AdminEditor"

export const dynamic = "force-dynamic"

const empty = { title: "", excerpt: "", body: "", sources: "" }

export default async function NewArticlePage() {
  const user = await currentUser()
  // The edge middleware only verifies the JWT signature and defers full auth to
  // here, so a stale-but-signed session (legacy token, bumped tokenVersion,
  // revoked session) lands here with no user. Redirect to login instead of
  // rendering the editor with no real session — matches the guard every other
  // /admin page already has.
  if (!user) redirect("/admin/login")
  const canPublish = user.privileges.includes("articles.publish")
  return (
    <AdminEditor
      canPublish={canPublish}
      initial={{ slug: "", coverImage: "", tags: [], featured: false, primaryLocale: "en", status: "DRAFT", en: empty, zh: empty }}
    />
  )
}
