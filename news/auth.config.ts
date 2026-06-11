import type { NextAuthConfig } from "next-auth"

// Edge-safe Auth.js config (no Prisma / bcrypt imports here so it can run in
// middleware). The Credentials provider with its DB-backed `authorize` lives in
// ./auth.ts which runs in the Node runtime.
export const authConfig = {
  trustHost: true,
  pages: {
    signIn: "/admin/login",
  },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    // Gate the /admin area. Returning false redirects to the signIn page.
    authorized({ auth, request: { nextUrl } }) {
      const isAdmin = nextUrl.pathname.startsWith("/admin")
      const isLogin = nextUrl.pathname.startsWith("/admin/login")
      if (isLogin) return true
      if (isAdmin) return !!auth?.user
      return true
    },
    jwt({ token, user }) {
      if (user) {
        token.id = (user as { id?: string }).id
        token.role = (user as { role?: string }).role
        token.name = user.name
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as string
      }
      return session
    },
  },
} satisfies NextAuthConfig
