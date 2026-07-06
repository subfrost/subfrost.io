# Deploying the frBTC volume indexer

Stage 1 (the wasm) is built and validated. This is the one-command hand-off for
stage 2 — it must be applied from a machine that can reach the metashrew cluster
(the k3s "Meta" box is LAN-only at `192.168.10.160`; the GKE metashrew clusters'
control planes are reachable from an operator machine, not the shared dev box).

## 1. Build the wasm (if not already present)

```bash
cd crates/frbtc-volume-indexer
cargo build --release --target wasm32-unknown-unknown
# → target/wasm32-unknown-unknown/release/frbtc_volume_indexer.wasm  (~1.5 MB)
```

## 2. Deliver the wasm to the node

- **k3s Meta box** (matches the prod `.v10-deploy` pattern): copy it to the
  indexer hostPath the StatefulSet mounts:
  ```bash
  scp target/wasm32-unknown-unknown/release/frbtc_volume_indexer.wasm \
      meta:/zpool/espo-debug/indexer-wasm/
  ```
- **GKE** (hostPath isn't durable): upload to a bucket and swap the `indexer`
  volume for an initContainer that fetches it (the 1.5 MB wasm exceeds the ~1 MB
  ConfigMap limit, so ConfigMap is out):
  ```bash
  gsutil cp frbtc_volume_indexer.wasm gs://<indexer-bucket>/
  ```
  ```yaml
  initContainers:
    - name: fetch-wasm
      image: google/cloud-sdk:slim
      command: [sh, -c, "gsutil cp gs://<indexer-bucket>/frbtc_volume_indexer.wasm /indexer/"]
      volumeMounts: [{ mountPath: /indexer, name: indexer }]
  # and make `data` + `indexer` PVCs instead of hostPaths.
  ```

## 3. Apply

```bash
kubectl apply -f statefulset.yaml   # edit namespace + bitcoind URL first
kubectl -n <ns> logs sts/frbtc-volume-indexer -f
```

Backfill runs from alkanes genesis (h=880000); bounded by bitcoind RPC
throughput. It's incremental — the views return partial data as it climbs, and
`frbtc_volume_tip` reports progress.

## 4. Wire the app

Expose the Service at a URL reachable from the subfrost-io GKE cluster (ingress
or internal LB), then set on the subfrost-io deployment:

```
FRBTC_INDEXER_RPC_URL=https://<indexer-rpc-host>
```

The Revenue tab (stage 3) auto-detects it: when set, the BTC wrap/unwrap fee
series comes from the indexer's `frbtc_volume_range` view with a freshness badge
(from `frbtc_volume_tip`); when unset, it falls back to the existing
WrapTransaction/UnwrapTransaction tables. No redeploy needed beyond the env var.

## Views

- `frbtc_volume_range` — input JSON `{"from":"YYYY-MM-DD","to":"YYYY-MM-DD"}` →
  `{ daily:[{date,wrapped_sats,unwrapped_sats,wrap_count,unwrap_count}], totals:{…, fee_revenue_sats} }`
- `frbtc_volume_tip` — `{ tip }` (last indexed height)

Called via JSON-RPC `metashrew_view` with params `[viewName, hexJsonInput, heightTag]`.
