"use server"

import { signIn, signOut } from "@/auth"

export async function doSignOut() {
  await signOut({ redirectTo: "/admin/login" })
}

export type LoginResult = { ok: true } | { ok: false; error: string }

export async function doLogin(email: string, password: string): Promise<LoginResult> {
  try {
    await signIn("credentials", { email, password, redirect: false })
    return { ok: true }
  } catch {
    return { ok: false, error: "Invalid email or password" }
  }
}
