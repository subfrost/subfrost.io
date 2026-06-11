import { currentUser, hasRole } from "@/lib/authz"
import { ArticleEditor } from "@/components/ArticleEditor"

export const dynamic = "force-dynamic"

export default async function NewArticlePage() {
  const user = await currentUser()
  const canPublish = user ? hasRole(user.role, "EDITOR") : false

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-white">New article</h1>
      <ArticleEditor
        canPublish={canPublish}
        initial={{
          title: "",
          slug: "",
          excerpt: "",
          body: "",
          coverImage: "",
          tags: [],
          featured: false,
          status: "DRAFT",
        }}
      />
    </div>
  )
}
