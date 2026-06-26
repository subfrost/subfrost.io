import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { listProducts, listInitiatives } from "@/lib/tasks/store"
import { ProductsClient } from "@/components/cms/board/ProductsClient"

export const dynamic = "force-dynamic"

export default async function ProductsPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("tasks.view")) redirect("/admin")

  const [products, initiatives] = await Promise.all([listProducts(), listInitiatives()])
  return (
    <ProductsClient
      products={products.filter((p) => !p.archived)}
      initiatives={initiatives.filter((i) => !i.archived)}
      canEdit={me.privileges.includes("tasks.edit")}
    />
  )
}
