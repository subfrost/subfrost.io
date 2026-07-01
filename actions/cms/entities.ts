"use server"

import { currentUser } from "@/lib/cms/authz"
import { LEGAL_VIEW } from "@/lib/financials/legal/privilege"
import { loadEntityDossier } from "@/lib/financials/legal/store"
import type { EntityDossier } from "@/lib/financials/legal/shapes"

// The Entities nav reuses the legal ladder: legal.view unlocks the dossier
// (read), legal.edit unlocks identity/tag/address edits (via legal.ts actions).

export type DossierResult =
  | { ok: true; dossier: EntityDossier }
  | { ok: false; error: "unauthorized" | "not_found" }

export async function entityDossierAction(id: string): Promise<DossierResult> {
  const me = await currentUser()
  if (!me || !me.privileges.includes(LEGAL_VIEW)) return { ok: false, error: "unauthorized" }
  const dossier = await loadEntityDossier(id)
  if (!dossier) return { ok: false, error: "not_found" }
  return { ok: true, dossier }
}
