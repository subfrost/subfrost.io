# Routing cdn.subfrost.io through tlsd to subfrost-cdn

tlsd (in the `tlsd-ingress` namespace) is the public TLS terminator. It
already fronts `subfrost.io`. Add a route for `cdn.subfrost.io` that points
at the `subfrost-cdn` ClusterIP Service, exactly like the existing
`subfrost.io` route points at the `subfrost-io` Service ClusterIP.

## 1. Get the subfrost-cdn Service ClusterIP

```
kubectl -n subfrost get svc subfrost-cdn -o jsonpath='{.spec.clusterIP}'
# e.g. 34.118.x.y
```

## 2. Add the route to the tlsd ConfigMap

In `k8s/tlsd-ingress/tlsd.yaml`, under the `tlsd-config` ConfigMap's
`tlsd.toml`, append (alongside the existing `[[route]]` blocks):

```toml
[[route]]
host = "cdn.subfrost.io"
backends = ["<subfrost-cdn-clusterIP>:80"]   # from step 1
algorithm = "round-robin"
upstream_scheme = "http"
```

The CDN sets CORS + cache headers itself, so no tlsd header rewriting is
needed. tlsd's inbound JA4 capture replaces the Go server's RabbitMQ
telemetry. Then roll tlsd:

```
kubectl apply -k k8s/tlsd-ingress
kubectl -n tlsd-ingress rollout restart deploy/tlsd
```

## 3. TLS for cdn.subfrost.io

tlsd serves its listener cert from the `tlsd-tls` Secret. Add (or include)
a `cdn.subfrost.io` SAN to that cert. If it's a managed/issued cert,
re-issue with the extra SAN and update the `tlsd-tls` Secret.

## 4. DNS cutover

`cdn.subfrost.io` currently points at the Go Cloud Run service (fronted by
a Cloudflare Worker). Once steps 1–3 are validated against the tlsd LB IP
(`34.170.98.157`, the `tlsd` Service `loadBalancerIP`):

```
# Point cdn.subfrost.io at the tlsd LoadBalancer
cdn.subfrost.io.  A  34.170.98.157
```

Validate before flipping DNS by sending Host-spoofed requests at the LB:

```
curl -k --resolve cdn.subfrost.io:443:34.170.98.157 https://cdn.subfrost.io/health
curl -k --resolve cdn.subfrost.io:443:34.170.98.157 https://cdn.subfrost.io/snapshots/foo.tar.gz -I
```

Keep the Go Cloud Run service up until the tlsd path is confirmed, then
flip DNS. Roll back by reverting the DNS A record.

## Note on the wasip2 alternative

A wasip2 component scaffold also exists at
`rust/crates/subfrost-cdn-wasm` (+ `CDN_RUST_PORT_DESIGN.md`). It would
load into tlsd as an `app_module` (`app_id = "subfrost_cdn"`) instead of a
separate Service+Deployment. We shipped the **container** as the
deployable (it streams large objects natively, reads env/secrets
normally, and is fully runnable/testable). The wasip2 route is blocked on
two tlsd host-side changes — guest env/secret injection and a streaming
(non-buffering) `AppRegistry::serve` — documented in the design doc.
```
