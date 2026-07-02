# Team pager — ntfy at page.subfrost.io

Self-hosted [ntfy](https://ntfy.sh) is the pager backbone: the `/admin/pager`
console, email/chat bridges, and every device (ntfy phone app now, ESP32
hardware pagers later) publish/subscribe through it.

Topic scheme: `page-<member>` per person + `page-all` for all-hands. The
roster lives in `lib/pager/config.ts`. Server auth is `deny-all` — every
subscriber and publisher needs a user/token minted below.

## One-time bootstrap (after first deploy)

1. **DNS (Cloudflare)**: add an `A` record `page` → `34.36.2.103`
   (`subfrost-io-ip`), **DNS-only (gray cloud)** — the Google ManagedCertificate
   must see the origin directly to provision. Check status:
   `kubectl get managedcertificate page-subfrost-io-cert -n subfrost`.

2. **Users + ACLs** (exec into the pod; auth.db lives on the PVC):

   ```bash
   NTFY="kubectl exec -it deploy/ntfy -n subfrost -- ntfy"
   # publisher identity used by the Next.js app and future bridges
   $NTFY user add --role=user publisher
   $NTFY access publisher 'page-*' write-only
   # one user per teammate (repeat per roster entry)
   $NTFY user add lee
   $NTFY access lee page-lee read-only
   $NTFY access lee page-all read-only
   ```

3. **Tokens**:

   ```bash
   $NTFY token add publisher     # -> tk_... for the app/bridges
   $NTFY token add lee           # -> tk_... for Lee's devices
   ```

4. **App secret** (standalone, out-of-band — mirrors `anthropic-api-key`):

   ```bash
   kubectl create secret generic ntfy-publish-token -n subfrost \
     --from-literal=NTFY_TOKEN=tk_<publisher-token>
   kubectl rollout restart deploy/subfrost-io -n subfrost
   ```

## Phone onboarding (per teammate)

1. Install the **ntfy** app (Play Store / App Store).
2. Settings → Default server: `https://page.subfrost.io`, log in with their
   username/token.
3. Subscribe to `page-<them>` and `page-all`.
4. Per-topic settings: priority ≥ high → **alarm sound + override DND**
   (Android; iOS gets high-priority push via the upstream-base-url relay).
5. Android only: exempt the ntfy app from battery optimization.

Test: send from `subfrost.io/admin/pager`, or
`curl -H "Authorization: Bearer tk_<publisher>" -H "X-Priority: 5" -d "test page" https://page.subfrost.io/page-lee`

## Notes

- Single replica on the spot pool: a preemption means ~1–2 min of pager
  downtime while the PD reattaches; the message cache (72h) redelivers
  anything published meanwhile once subscribers reconnect.
- Email/Discord/Element ingest is not wired yet — planned as small bridges
  publishing with the `publisher` token.
