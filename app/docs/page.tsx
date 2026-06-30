import { redirect } from "next/navigation"
import { externalLinks } from "@/lib/external-links"

export default function DocsIndexPage() {
  redirect(externalLinks.docs)
}

