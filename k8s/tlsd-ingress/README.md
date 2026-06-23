# tlsd ingress (TLS-fingerprint terminator) for subfrost.io

`tlsd` is the live TLS-terminating L7 ingress in front of subfrost.io. It
terminates client TLS, computes the client **JA4** fingerprint, injects it as
`X-TLS-JA4`, and proxies to the in-cluster Next.js Service. The app records the
fingerprint on each session (`Session.tlsFingerprint`) for device/session
management. See the `tls-fingerprint-sessions` epic.

## Request path (live)

```
client → Cloudflare DNS (grey-cloud, A subfrost.io → tlsd LB)
       → tlsd LoadBalancer 34.170.98.157 (this namespace)
         :443 → terminate TLS + compute JA4 + inject X-TLS-JA4 → subfrost-io Service :80
         :80  → nginx 301 → https
```

Cloudflare must stay **grey-cloud (DNS-only)** on the apex — if it were proxied
(orange), Cloudflare would terminate TLS and tlsd would only ever see
*Cloudflare's* fingerprint, not the real client's.

## What's here

- `tlsd.yaml` — ConfigMaps (`tlsd-config` + nginx `:80→:443` redirect),
  2-replica Deployment, LoadBalancer Service (`:443`, `:80`).
- Image: `us-central1-docker.pkg.dev/night-wolves-jogging/subfrost-docker/tlsd:<tag>`
  built from the `tlsfetch` repo via `cloudbuild-tlsd-io.yaml` (prebuilt-binary
  path: `cargo build --release -p tlsd --features wasm` first). The JA4-capture
  code is the `feat/tlsd-inbound-ja4` branch (pyrosec/tlsfetch PR #2).
- The upstream backend is the `subfrost-io` Service **ClusterIP** (tlsd's LB
  selector takes `IP:port`, not a DNS name). If that Service is recreated and
  its ClusterIP changes, update `backends` in `tlsd-config`.

## NOT in this directory (managed separately)

- **`tlsd-tls` Secret** (cert + private key) — created out-of-band, **never
  committed**. Currently a Let's Encrypt cert issued via DNS-01 (Cloudflare
  token in Secret Manager `subfrost-admin-cloudflare-api-token`):
  ```
  CF_DNS_API_TOKEN=<token> lego --accept-tos --email admin@subfrost.io \
    --dns cloudflare --domains subfrost.io --domains tlsd-canary.subfrost.io \
    --path ./lego run
  kubectl -n tlsd-ingress create secret generic tlsd-tls \
    --from-file=tls.crt=lego/certificates/subfrost.io.crt \
    --from-file=tls.key=lego/certificates/subfrost.io.key
  ```

## Open follow-ups

- **Cert auto-renewal** — the LE cert is static (~90 days). Move to cert-manager
  (Cloudflare DNS-01 issuer) or a renewal cron before expiry.
- **Flux wiring** — this directory is applied manually (`kubectl apply -k .`); it
  is intentionally not referenced by `../kustomization.yaml`. Wire a dedicated
  Flux Kustomization (separate from the app's) to reconcile it.

## Apply / roll

```
kubectl apply -k k8s/tlsd-ingress/         # apply manifests (cert Secret must exist)
kubectl set image deploy/tlsd -n tlsd-ingress tlsd=<registry>/tlsd:<newtag>
```

## Rollback the cutover (instant)

Point the Cloudflare apex back at the previous Google LB:
`A subfrost.io → 34.36.2.103` (grey-cloud). `www.subfrost.io` is a separate
Vercel CNAME and is unaffected by any of this.
