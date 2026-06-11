import { currentUser, hasRole } from "@/lib/cms/authz"
import { AdminEditor } from "@/components/cms/AdminEditor"

export const dynamic = "force-dynamic"

const empty = { title: "", excerpt: "", body: "" }

export default async function NewArticlePage() {
  const user = await currentUser()
  const canPublish = user ? hasRole(user.role, "EDITOR") : false
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
