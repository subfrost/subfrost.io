import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { listTasks, listInitiatives, listAssignableUsers } from "@/lib/tasks/store"
import { BoardClient } from "@/components/cms/board/BoardClient"

export const dynamic = "force-dynamic"

export default async function BoardPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("tasks.view")) redirect("/admin")

  const [tasks, initiatives, members] = await Promise.all([listTasks(), listInitiatives(), listAssignableUsers()])
  return (
    <BoardClient
      tasks={tasks}
      initiatives={initiatives.filter((i) => !i.archived)}
      members={members}
      meId={me.id}
      canEdit={me.privileges.includes("tasks.edit")}
    />
  )
}
