"use server"

import { headers } from "next/headers"
import { currentUser } from "@/lib/cms/authz"
import {
  getAddressProfile,
  setAddressNote,
  invalidateProfileCache,
  type AddressProfileData,
} from "@/lib/community/address-profile"
import { audit } from "@/lib/cms/audit"

async function ip(): Promise<string | null> {
  const h = await headers()
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null
}

export type ProfileResult =
  | { ok: true; profile: AddressProfileData; canEdit: boolean }
  | { ok: false; error: string }

/** Load an address profile. Requires REFERRAL_VIEW or FUEL_VIEW. */
export async function addressProfileAction(address: string): Promise<ProfileResult> {
  const me = await currentUser()
  if (!me) return { ok: false, error: "Not authenticated" }
  if (!me.privileges.includes("REFERRAL_VIEW") && !me.privileges.includes("FUEL_VIEW")) {
    return { ok: false, error: "Insufficient privileges" }
  }
  if (!address?.trim()) return { ok: false, error: "Address required" }
  const profile = await getAddressProfile(address)
  // Editing the note rides on FUEL_EDIT (the address-curation privilege).
  return { ok: true, profile, canEdit: me.privileges.includes("FUEL_EDIT") }
}

export async function updateAddressNoteAction(
  address: string,
  note: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await currentUser()
  if (!me) return { ok: false, error: "Not authenticated" }
  if (!me.privileges.includes("FUEL_EDIT")) return { ok: false, error: "Insufficient privileges" }
  if (!address?.trim()) return { ok: false, error: "Address required" }
  await setAddressNote(address, note)
  invalidateProfileCache()
  await audit("update_address_note", { actorId: me.id, target: address.trim(), ip: await ip() })
  return { ok: true }
}
