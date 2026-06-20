import Link from "next/link"
import { peekToken } from "@/lib/cms/tokens"
import { SetPasswordForm } from "@/components/cms/SetPasswordForm"

export const dynamic = "force-dynamic"

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  const purpose = token ? await peekToken(token) : null
  const valid = purpose === "INVITE" || purpose === "PASSWORD_RESET"

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8">
        <div className="mb-6 text-center">
          <div className="text-xl font-bold text-white">SUBFROST</div>
          <div className="text-xs uppercase tracking-widest text-zinc-500">Editorial</div>
        </div>
        {valid && token ? (
          <SetPasswordForm token={token} invite={purpose === "INVITE"} />
        ) : (
          <div className="space-y-4 text-center">
            <p className="text-sm text-red-400">This link is invalid or has expired.</p>
            <Link href="/admin/forgot-password" className="text-sm text-sky-400 hover:text-sky-300">Request a new link</Link>
          </div>
        )}
      </div>
    </div>
  )
}
