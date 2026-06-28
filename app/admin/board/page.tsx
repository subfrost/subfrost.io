import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { listTasks, listDeletedTasks, listInitiatives, listProducts, listAssignableUsers } from "@/lib/tasks/store"
import { BoardClient } from "@/components/cms/board/BoardClient"

export const dynamic = "force-dynamic"

export default async function BoardPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("tasks.view")) redirect("/admin")

  const canEdit = me.privileges.includes("tasks.edit")
  const [tasks, deletedTasks, initiatives, products, members] = await Promise.all([
    listTasks(),
    canEdit ? listDeletedTasks() : Promise.resolve([]),
    listInitiatives(),
    listProducts(),
    listAssignableUsers(),
  ])
  return (
    <BoardClient
      tasks={tasks}
      deletedTasks={deletedTasks}
      initiatives={initiatives.filter((i) => !i.archived)}
      products={products.filter((p) => !p.archived)}
      members={members}
      meId={me.id}
      canEdit={canEdit}
    />
  )
}
