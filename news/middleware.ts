import NextAuth from "next-auth"
import { authConfig } from "@/auth.config"

// Edge middleware uses only the edge-safe config (no Prisma/bcrypt) to gate
// /admin via the `authorized` callback.
export const { auth: middleware } = NextAuth(authConfig)

export const config = {
  // Run on /admin routes only; exclude Next internals and the auth API.
  matcher: ["/admin/:path*"],
}
