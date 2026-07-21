# Deploying the frBTC-on-BRC20-Prog volume indexer

The sibling of `crates/frbtc-volume-indexer/deploy` (the alkanes 32:0 one). Same
rockshrew-mono hand-off; the only differences are the **required build feature
flag**, the artifact name, the start block, and distinct data/wasm paths so the
two indexers never collide on a shared node.

Must be applied from a machine that can reach the metashrew cluster (the k3s
"Meta" box is LAN-only at `192.168.10.160`; the GKE metashrew clusters' control
planes are reachable from an operator machine, not the shared dev box).

## 1. Build the wasm

Unlike the alkanes crate, the deployable wasm is **feature-gated** (the default
build is the pure model + native fixture tests, dep-free):

```bash
cd crates/frbtc-brc20-volume-indexer
cargo build --release --features metashrew --target wasm32-unknown-unknown
# → target/wasm32-unknown-unknown/release/frbtc_brc20_volume_indexer.wasm  (~240 KB)
# (offload the cold compile to rcargo: RCARGO_HOST=meta rcargo ... --features metashrew)
```

Exports `_start` / `frbtc_volume_range` / `frbtc_volume_tip` — the SAME view names
and JSON shape as the alkanes indexer, so `lib/financials/frbtc-indexer.ts` reads
either one unchanged (it selects the venue via env, not view name).

## 2. Deliver the wasm to the node

- **k3s Meta box** (matches the prod `.v10-deploy` pattern): copy it to the
  indexer hostPath the StatefulSet mounts (distinct from the alkanes dir):
  ```bash
  ssh meta 'mkdir -p /zpool/espo-debug/brc20-indexer-wasm'
  scp target/wasm32-unknown-unknown/release/frbtc_brc20_volume_indexer.wasm \
      meta:/zpool/espo-debug/brc20-indexer-wasm/
  ```
- **GKE** (hostPath isn't durable): upload to a bucket and swap the `indexer`
  volume for an initContainer that fetches it:
  ```bash
  gsutil cp frbtc_brc20_volume_indexer.wasm gs://<indexer-bucket>/
  ```
  ```yaml
  initContainers:
    - name: fetch-wasm
      image: google/cloud-sdk:slim
      command: [sh, -c, "gsutil cp gs://<indexer-bucket>/frbtc_brc20_volume_indexer.wasm /indexer/"]
      volumeMounts: [{ mountPath: /indexer, name: indexer }]
  # and make `data` + `indexer` PVCs instead of hostPaths.
  ```

## 3. Apply

```bash
kubectl apply -f statefulset.yaml   # edit namespace + bitcoind URL first
kubectl -n <ns> logs sts/frbtc-brc20-volume-indexer -f
```

Backfill runs from the frBTC BRC20-Prog deploy height (h=928300, padded below the
h=928317 deploy / h=928546 first wrap); bounded by bitcoind RPC throughput. It's
incremental — the views return partial data as it climbs, and `frbtc_volume_tip`
reports progress. Expected at tip: ~3577 wraps / 21.92 BTC wrapped, ~1363 unwraps
/ 20.94 BTC settled (matches the production esplora cross-check).

## 4. Wire the app

Expose the Service at a URL reachable from the subfrost-io GKE cluster (ingress or
internal LB), mirroring the alkanes route `https://mainnet.l.subfrost.io/v4/jsonrpc/frbtc`
(e.g. a sibling `.../frbtc-brc20` path), then set on the subfrost-io deployment
(`k8s/deployment.yaml`, next to `FRBTC_INDEXER_RPC_URL`):

```
FRBTC_BRC20_INDEXER_RPC_URL=https://<indexer-rpc-host>
```

Both surfaces auto-detect it:
- **/admin Revenue** — the BTC fee headline becomes cumulative (alkanes +
  BRC20-Prog) and the VenueSplit breaks the two out separately, each with its
  own indexer freshness badge.
- **public /volume** (`lib/volume-data.ts`) — the `brc20` source switches from
  the request-time esplora scan to this indexer (the source of truth). Until the
  env is set, both surfaces read the BRC20-Prog venue as 0 / "indexer offline"
  (public falls back to the legacy scan) with no regression.
