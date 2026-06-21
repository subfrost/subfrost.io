import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
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
  const canPublish = user.privileges.includes("PUBLISH_ARTICLES")
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-white">New article</h1>
      <AdminEditor
        canPublish={canPublish}
        initial={{ slug: "", coverImage: "", tags: [], featured: false, primaryLocale: "en", status: "DRAFT", en: empty, zh: empty }}
      />
    </div>
  )
}
