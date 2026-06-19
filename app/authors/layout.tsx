import type { ReactNode } from "react"
import { EditorialShell } from "@/components/articles/EditorialShell"

export default function AuthorsLayout({ children }: { children: ReactNode }) {
  return <EditorialShell>{children}</EditorialShell>
}
