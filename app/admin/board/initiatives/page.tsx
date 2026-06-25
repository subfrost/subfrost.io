import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { listTasks, listInitiatives } from "@/lib/tasks/store"
import { InitiativesClient } from "@/components/cms/board/InitiativesClient"

export const dynamic = "force-dynamic"

export default async function InitiativesPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("tasks.view")) redirect("/admin")

  const [tasks, initiatives] = await Promise.all([listTasks(), listInitiatives()])
  return (
    <InitiativesClient
      initiatives={initiatives.filter((i) => !i.archived)}
      tasks={tasks}
      canEdit={me.privileges.includes("tasks.edit")}
    />
  )
}
