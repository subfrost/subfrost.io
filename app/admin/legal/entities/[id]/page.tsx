import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

// The entity profile now lives at /admin/entities/[id] (the unified dossier is
// the single source of truth). This legacy legal route just forwards there.
export default async function LegalEntityRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/admin/entities/${id}`)
}
