// Server-side ntfy client for the team pager.
//
// Two credentials, least privilege each way:
//  - NTFY_TOKEN        (user `publisher`, write-only on page-*) — sending pages
//  - NTFY_ADMIN_TOKEN  (role=admin user)                        — member management
//    via ntfy's admin API (/v1/users, /v1/users/access). That API is beta and
//    thinly documented; every call here is shaped per ntfy v2.14 (pinned in
//    k8s/ntfy/deployment.yaml) — verify before bumping the server image.
//
// Members ARE ntfy users: any role=user account except `publisher` is a
// teammate, subscribed read-only to page-<id> and page-all. No app DB table.

import { randomBytes } from "crypto"
import { ALL_TOPIC, NTFY_ADMIN_TOKEN, NTFY_TOKEN, NTFY_URL, topicFor } from "@/lib/pager/config"

export interface PagerMemberInfo {
  id: string
  topic: string
}

const RESERVED_USERS = new Set(["publisher", "pager-admin"])
// Hardware pager accounts (firmware/atom-pager): one read-only ntfy user per
// member's device, separate from their phone login so either can be rotated
// without touching the other.
export const DEVICE_PREFIX = "dev-"
export const MEMBER_ID_RE = /^[a-z][a-z0-9-]{1,31}$/

async function ntfyFetch(path: string, init: RequestInit, token: string | undefined): Promise<Response> {
  if (!token) throw new Error("ntfy credential not configured")
  return fetch(`${NTFY_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    cache: "no-store",
  })
}

export async function publishPage(opts: {
  topic: string
  message: string
  title: string
  urgent: boolean
  /** ACK button target — tapping it POSTs here from the notification. */
  ackUrl?: string
}): Promise<{ id: string }> {
  const headers: Record<string, string> = {
    "X-Title": opts.title,
    "X-Priority": opts.urgent ? "5" : "3",
    "X-Tags": opts.urgent ? "rotating_light" : "information_source",
  }
  if (opts.ackUrl) {
    // `clear=true` dismisses the notification on tap; GET/POST both accepted
    // by the ack route so the link also works from a browser.
    headers["X-Actions"] = `http, ACK, ${opts.ackUrl}, method=POST, clear=true`
  }
  const res = await ntfyFetch(
    `/${opts.topic}`,
    { method: "POST", headers, body: opts.message },
    NTFY_TOKEN,
  )
  if (!res.ok) throw new Error(`ntfy publish failed (${res.status}): ${await res.text().catch(() => "")}`)
  return res.json()
}

export async function listMembers(): Promise<PagerMemberInfo[]> {
  const res = await ntfyFetch("/v1/users", { method: "GET" }, NTFY_ADMIN_TOKEN)
  if (!res.ok) throw new Error(`ntfy list users failed (${res.status})`)
  const users = (await res.json()) as Array<{ username: string; role: string }>
  return users
    .filter((u) => u.role === "user" && !RESERVED_USERS.has(u.username) && !u.username.startsWith(DEVICE_PREFIX))
    .map((u) => ({ id: u.username, topic: topicFor(u.username) }))
}

async function grantRead(username: string, topic: string): Promise<void> {
  const res = await ntfyFetch(
    "/v1/users/access",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, topic, permission: "read-only" }),
    },
    NTFY_ADMIN_TOKEN,
  )
  if (!res.ok) throw new Error(`ntfy grant ${topic} to ${username} failed (${res.status})`)
}

/** Create the member's ntfy user + read ACLs and mint their device token.
 *  The token is returned ONCE and stored nowhere on our side. */
/* Returns the generated password ONCE (stored nowhere on our side) — the
 * phone apps require username + password; ntfy access tokens only work with
 * an EMPTY username in basic auth, which the apps don't allow. */
export async function createMember(id: string): Promise<{ id: string; topic: string; password: string }> {
  if (id.startsWith(DEVICE_PREFIX)) throw new Error(`member ids may not start with "${DEVICE_PREFIX}" (reserved for device accounts)`)
  const password = randomBytes(12).toString("base64url")
  const res = await ntfyFetch(
    "/v1/users",
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: id, password }),
    },
    NTFY_ADMIN_TOKEN,
  )
  if (!res.ok) throw new Error(`ntfy create user failed (${res.status}): ${await res.text().catch(() => "")}`)

  await grantRead(id, topicFor(id))
  await grantRead(id, ALL_TOPIC)

  return { id, topic: topicFor(id), password }
}

async function deleteUser(username: string): Promise<Response> {
  return ntfyFetch(
    "/v1/users",
    {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username }),
    },
    NTFY_ADMIN_TOKEN,
  )
}

export async function deleteMember(id: string): Promise<void> {
  if (RESERVED_USERS.has(id)) throw new Error("cannot delete reserved user")
  const res = await deleteUser(id)
  if (!res.ok) throw new Error(`ntfy delete user failed (${res.status})`)
  // Best-effort: revoke the paired hardware pager too (may not exist).
  await deleteUser(DEVICE_PREFIX + id).catch(() => {})
}

/** (Re)issue credentials for a member's hardware pager (M5 Atom Echo,
 *  firmware/atom-pager). Deletes any existing `dev-<id>` account first, so
 *  re-provisioning rotates the password and bricks the old device. Read-only
 *  on the same topics as the member's phone. Password returned ONCE. */
export async function provisionDevice(memberId: string): Promise<{ username: string; password: string; topic: string }> {
  const username = DEVICE_PREFIX + memberId
  const password = randomBytes(12).toString("base64url")
  await deleteUser(username).catch(() => {}) // 40x when absent — fine
  const res = await ntfyFetch(
    "/v1/users",
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    },
    NTFY_ADMIN_TOKEN,
  )
  if (!res.ok) throw new Error(`ntfy create device user failed (${res.status}): ${await res.text().catch(() => "")}`)
  await grantRead(username, topicFor(memberId))
  await grantRead(username, ALL_TOPIC)
  return { username, password, topic: topicFor(memberId) }
}
