// Team pager config — the ntfy server (k8s/ntfy) is the delivery backbone;
// this module is the single place the app knows about topics and the roster.
//
// Topics: one per person (`page-<id>`) plus the all-hands `page-all`. Devices
// (ntfy phone app now, ESP32 pagers later) subscribe to their personal topic
// and page-all; the console/bridges publish to them.
//
// Roster: edit here to add/remove teammates. `id` is the topic suffix — keep
// it lowercase/stable since devices bake it in.

export interface PagerMember {
  id: string
  name: string
}

export const PAGER_ROSTER: PagerMember[] = [
  { id: "lee", name: "Lee" },
  // { id: "alice", name: "Alice" },
]

export const ALL_TOPIC = "page-all"

export function topicFor(memberId: string): string {
  return `page-${memberId}`
}

// In-cluster by default (no TLS hop, works even if the public ingress is
// mid-migration); NTFY_URL overrides for local dev against the public host.
export const NTFY_URL = process.env.NTFY_URL ?? "http://ntfy.subfrost.svc.cluster.local"
export const NTFY_TOKEN = process.env.NTFY_TOKEN
