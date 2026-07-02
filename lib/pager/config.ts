// Team pager config — the ntfy server (k8s/ntfy) is the delivery backbone.
//
// Topics: one per person (`page-<id>`) plus the all-hands `page-all`. Devices
// (ntfy phone app now, ESP32 pagers later) subscribe to their personal topic
// and page-all; the console/bridges publish to them.
//
// The roster is NOT stored here: members are ntfy user accounts, managed from
// /admin/pager via the admin API (see lib/pager/ntfy.ts).

export const ALL_TOPIC = "page-all"
export const PUBLIC_PAGER_URL = "https://page.subfrost.io"

export function topicFor(memberId: string): string {
  return `page-${memberId}`
}

// In-cluster by default (no TLS hop, works even if the public ingress is
// mid-migration); NTFY_URL overrides for local dev against the public host.
export const NTFY_URL = process.env.NTFY_URL ?? "http://ntfy.subfrost.svc.cluster.local"
export const NTFY_TOKEN = process.env.NTFY_TOKEN
export const NTFY_ADMIN_TOKEN = process.env.NTFY_ADMIN_TOKEN
