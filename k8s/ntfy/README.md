# Team pager — ntfy at page.subfrost.io

Self-hosted [ntfy](https://ntfy.sh) is the pager backbone: the `/admin/pager`
console, email/chat bridges, and every device (ntfy phone app now, ESP32
hardware pagers later) publish/subscribe through it.

Topic scheme: `page-<member>` per person + `page-all` for all-hands. Members
ARE ntfy user accounts — the roster is managed entirely from
`subfrost.io/admin/pager` (add teammate → account + read-only ACLs + one-time
device token; remove → access revoked instantly). Server auth is `deny-all`.

## One-time bootstrap (after first deploy)

1. **DNS (Cloudflare)** — done: `A page → 34.36.2.103` (`subfrost-io-ip`),
   **DNS-only (gray cloud)** so the ManagedCertificate can provision. Status:
   `kubectl get managedcertificate page-subfrost-io-cert -n subfrost`.

2. **Two service accounts** (exec into the pod; auth.db lives on the PVC):

   ```bash
   N="kubectl exec deploy/ntfy -n subfrost --"
   # write-only publisher: what the app + bridges send pages with
   $N env NTFY_PASSWORD="$(openssl rand -base64 18)" ntfy user add --role=user publisher
   $N ntfy access publisher 'page-*' write-only
   # admin: powers roster management from /admin/pager (beta /v1/users API)
   $N env NTFY_PASSWORD="$(openssl rand -base64 18)" ntfy user add --role=admin pager-admin
   # tokens (each prints once)
   $N ntfy token add publisher
   $N ntfy token add pager-admin
   ```

3. **App secret** (standalone, out-of-band — mirrors `anthropic-api-key`):

   ```bash
   kubectl create secret generic ntfy-publish-token -n subfrost \
     --from-literal=NTFY_TOKEN=tk_<publisher-token> \
     --from-literal=NTFY_ADMIN_TOKEN=tk_<pager-admin-token>
   kubectl rollout restart deploy/subfrost-io -n subfrost
   ```

Everything after this — adding/removing teammates, minting device tokens,
phone setup steps — happens in `subfrost.io/admin/pager`.

## Test

Send from `/admin/pager`, or:
`curl -H "Authorization: Bearer tk_<publisher>" -H "X-Priority: 5" -d "test page" https://page.subfrost.io/page-lee`

## Notes

- The roster/token flows use ntfy's **beta admin API** (`/v1/users`,
  `/v1/users/access`), shaped against the pinned `v2.14.0` image — re-verify
  before bumping the server version. CLI fallback: `ntfy user/access/token`
  via `kubectl exec` as above.
- The ntfy web UI is disabled (`web-root: disable`): page.subfrost.io is
  API-only; humans only ever touch /admin/pager (CMS session auth).
- Single replica on the spot pool: a preemption means ~1–2 min of pager
  downtime while the PD reattaches; the 72h message cache redelivers
  anything published meanwhile once subscribers reconnect.
- Email/Discord/Element ingest is not wired yet — planned as small bridges
  publishing with the `publisher` token.
