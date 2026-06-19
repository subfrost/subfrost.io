import type { ReactNode } from "react"
import { EditorialShell } from "@/components/articles/EditorialShell"

export default function ArticlesLayout({ children }: { children: ReactNode }) {
  return <EditorialShell>{children}</EditorialShell>
}
