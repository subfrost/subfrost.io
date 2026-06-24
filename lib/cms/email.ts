// Resend email wrapper for the CMS. Matches the sibling-project convention
// (subfrost-mobile): env var RESEND_API_KEY, verified sender domain
// mail.subfrost.io. If RESEND_API_KEY is unset the send is a logged no-op so
// local/dev and unconfigured environments don't crash — mirrors the MockResend
// fallback in subfrost-wallet-api.
import { Resend } from "resend"

const FROM = process.env.EMAIL_FROM ?? "SUBFROST <noreply@mail.subfrost.io>"
const APP_URL = process.env.CMS_BASE_URL ?? "https://subfrost.io"

let client: Resend | null = null
function resend(): Resend | null {
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  if (!client) client = new Resend(key)
  return client
}

export interface SendResult {
  ok: boolean
  id?: string
  skipped?: boolean
  error?: string
}

export async function sendEmail(opts: {
  to: string
  subject: string
  html: string
}): Promise<SendResult> {
  const r = resend()
  if (!r) {
    console.warn(`[email] RESEND_API_KEY unset — skipping send to ${opts.to} (“${opts.subject}”)`)
    return { ok: true, skipped: true }
  }
  try {
    const { data, error } = await r.emails.send({
      from: FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    })
    if (error) return { ok: false, error: String(error.message ?? error) }
    return { ok: true, id: data?.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// --- Templates -------------------------------------------------------------

function shell(heading: string, bodyHtml: string): string {
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
  <h2 style="font-size:18px;margin:0 0 16px">${heading}</h2>
  ${bodyHtml}
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
  <p style="font-size:12px;color:#64748b;margin:0">SUBFROST · subfrost.io</p>
</div>`
}

function button(href: string, label: string): string {
  return `<p style="margin:20px 0"><a href="${href}" style="display:inline-block;background:#0ea5e9;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">${label}</a></p>
  <p style="font-size:12px;color:#64748b;word-break:break-all">Or paste this link: ${href}</p>`
}

export function inviteEmail(token: string, name?: string | null) {
  const href = `${APP_URL}/admin/set-password?token=${token}`
  return {
    subject: "You've been invited to the SUBFROST newsroom",
    html: shell(
      "Set up your SUBFROST account",
      `<p>${name ? `Hi ${name}, ` : ""}you've been invited to the SUBFROST editorial CMS. Click below to set your password and sign in. This link expires in 48 hours.</p>${button(href, "Set my password")}`,
    ),
  }
}

export function passwordResetEmail(token: string, name?: string | null) {
  const href = `${APP_URL}/admin/set-password?token=${token}`
  return {
    subject: "Reset your SUBFROST password",
    html: shell(
      "Reset your password",
      `<p>${name ? `Hi ${name}, ` : ""}we received a request to reset your password. Click below to choose a new one. This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>${button(href, "Reset password")}`,
    ),
  }
}

export function verifyEmail(token: string, name?: string | null) {
  const href = `${APP_URL}/admin/verify-email?token=${token}`
  return {
    subject: "Confirm your SUBFROST email",
    html: shell(
      "Confirm your email",
      `<p>${name ? `Hi ${name}, ` : ""}please confirm this email address. This link expires in 24 hours.</p>${button(href, "Confirm email")}`,
    ),
  }
}

export function onboardingEmail(name: string | null, tempPassword: string) {
  const href = `${APP_URL}/admin/login`
  return {
    subject: "Your SUBFROST admin account",
    html: shell(
      "Welcome to the SUBFROST admin",
      `<p>${name ? `Hi ${name}, ` : ""}an admin account has been created for you. Sign in with this temporary password, then change it from your profile:</p>
       <p style="font-family:ui-monospace,Menlo,monospace;font-size:16px;letter-spacing:1px;background:#f1f5f9;color:#0f172a;padding:10px 14px;border-radius:8px;display:inline-block">${tempPassword}</p>
       ${button(href, "Sign in")}`,
    ),
  }
}

/** True when Resend is configured — lets callers tell a real send from the no-op. */
export function isEmailEnabled(): boolean {
  return !!process.env.RESEND_API_KEY
}

export function newArticleEmail(args: {
  title: string
  excerpt: string
  slug: string
  locale: "en" | "zh"
  unsubscribeUrl: string
}): { subject: string; html: string } {
  const href = `${APP_URL}/articles/${args.slug}`
  const copy =
    args.locale === "zh"
      ? { subject: `新文章：${args.title}`, heading: args.title, read: "阅读全文", unsub: "退订" }
      : { subject: `New article: ${args.title}`, heading: args.title, read: "Read the article", unsub: "Unsubscribe" }
  const body = `<p>${args.excerpt}</p>
  <p style="margin:20px 0"><a href="${href}" style="display:inline-block;background:#0ea5e9;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">${copy.read}</a></p>
  <p style="font-size:12px;color:#94a3b8;margin-top:8px"><a href="${args.unsubscribeUrl}" style="color:#94a3b8">${copy.unsub}</a></p>`
  return { subject: copy.subject, html: shell(copy.heading, body) }
}
