import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { listTasks, listInitiatives } from "@/lib/tasks/store"
import { BoardClient } from "@/components/cms/board/BoardClient"

export const dynamic = "force-dynamic"

export default async function BoardPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("tasks.view")) redirect("/admin")

  const [tasks, initiatives] = await Promise.all([listTasks(), listInitiatives()])
  return (
    <BoardClient
      tasks={tasks}
      initiatives={initiatives.filter((i) => !i.archived)}
      meId={me.id}
      canEdit={me.privileges.includes("tasks.edit")}
    />
  )
}
