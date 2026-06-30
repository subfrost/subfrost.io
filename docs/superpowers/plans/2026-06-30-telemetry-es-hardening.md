# Telemetry ES Hardening + Flux Implementation Plan (Part A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the telemetry Elasticsearch `green`, durable on the spot-only cluster, and Flux-managed — without removing it from spot.

**Architecture:** Edit the existing `k8s/telemetry/` scaffolds (apply templates+ILM and heal the single-node `yellow`, harden the StatefulSet for spot pre-emption, add an ES→GCS DR CronJob), trim the kustomization to the components we actually run, and wire a dedicated Flux `Kustomization`. Verification is via `kubectl-io.sh` against the live cluster, not unit tests (infra).

**Tech Stack:** GKE (`subfrost-io`, project `night-wolves-jogging`, ns `telemetry`), Elasticsearch 8.14.3 (single-node, spot, RWO PVC), Flux CD, Kustomize, `.ioenv-extracted/kubectl-io.sh` (io-sa), Workload Identity → GSA `subfrost-io-k8s@night-wolves-jogging.iam.gserviceaccount.com`.

## Global Constraints

- **GitOps:** infra changes are manifests in `subfrost/subfrost.io`; Flux reconciles from `main`. No manual volume surgery (force-detach) — fix via definition.
- **Cluster is 100% spot** (`spot-pool`), no stable node pool. ES stays on spot.
- **Run all kubectl via** `bash "C:/Alkanes Geral Dev/.ioenv-extracted/kubectl-io.sh" <args>` (io-sa; can create sts/jobs/cronjobs/ns in `telemetry`).
- **Flux nudge order:** annotate `gitrepository subfrost-io` BEFORE `kustomization` (ns `flux-system`).
- **Single-node ES** ⇒ `number_of_replicas: 0` everywhere (else `yellow` forever).
- **ES is already Running with ~94,613 docs re-indexed** — every change must converge, never destructively replace the data PVC.
- **Merge to main + the one-time `kubectl apply` of the Flux Kustomization CR + final deploy are human-owned** — confirm with Vitor (memory `always-pr-for-code-changes`).
- Branch: `feat/tlsd-first-party-analytics` (shared with Part B; the spec lives at `docs/superpowers/specs/2026-06-30-tlsd-first-party-analytics-design.md`).
- Windows + Git Bash; no PowerShell heredocs.

---

### Task A1: Apply templates/ILM + heal the single-node yellow

**Files:**
- Modify: `k8s/telemetry/es-bootstrap-job.yaml` (append a replicas-heal step to the command)

**Context:** `GET _index_template/subfrost-cdn` returns **404** — the bootstrap never ran, so there is no ILM (indices never expire) and no template for new daily indices. The re-indexed indices carry `replicas:1` from the dump mappings → 14 unassigned shards → `yellow`. The template ConfigMap already sets `replicas:0` for *new* indices; existing ones need a `_settings` PUT.

- [ ] **Step 1: Add the replicas-heal step to the bootstrap command**

In `k8s/telemetry/es-bootstrap-job.yaml`, inside the `command:` script, after the four `curl ... PUT` template/ILM lines and before `echo "bootstrap OK"`, insert:

```sh
              echo "healing single-node yellow: replicas=0 on existing indices..."
              curl -fsS -X PUT "$ES_URL/subfrost-cdn-*,subfrost-diagnostics-*/_settings" \
                -H 'Content-Type: application/json' \
                -d '{"index":{"number_of_replicas":0}}'
```

- [ ] **Step 2: Validate the manifest builds**

Run: `bash "C:/Alkanes Geral Dev/.ioenv-extracted/kubectl-io.sh" apply --dry-run=server -f "C:/Alkanes Geral Dev/subfrost.io/k8s/telemetry/index-template-configmap.yaml" -f "C:/Alkanes Geral Dev/subfrost.io/k8s/telemetry/es-bootstrap-job.yaml"`
Expected: both objects `configured (server dry run)` / `created (server dry run)`, no schema error.

- [ ] **Step 3: Run the bootstrap to verify the heal works end-to-end**

The Job is idempotent. Apply the ConfigMap + (re)run the Job by hand to prove it heals `green` (this is validation; the durable apply is via Flux after merge):

```bash
KIO="C:/Alkanes Geral Dev/.ioenv-extracted/kubectl-io.sh"
bash "$KIO" -n telemetry apply -f "C:/Alkanes Geral Dev/subfrost.io/k8s/telemetry/index-template-configmap.yaml"
bash "$KIO" -n telemetry delete job es-bootstrap --ignore-not-found
bash "$KIO" -n telemetry apply -f "C:/Alkanes Geral Dev/subfrost.io/k8s/telemetry/es-bootstrap-job.yaml"
bash "$KIO" -n telemetry wait --for=condition=complete job/es-bootstrap --timeout=120s
```
Expected: `job.batch/es-bootstrap condition met`.

- [ ] **Step 4: Verify green + template + ILM present**

```bash
KIO="C:/Alkanes Geral Dev/.ioenv-extracted/kubectl-io.sh"
bash "$KIO" -n telemetry exec elasticsearch-0 -c elasticsearch -- curl -s "localhost:9200/_cluster/health" | grep -o '"status":"[a-z]*"'
bash "$KIO" -n telemetry exec elasticsearch-0 -c elasticsearch -- curl -s -o /dev/null -w "%{http_code}\n" "localhost:9200/_index_template/subfrost-cdn"
bash "$KIO" -n telemetry exec elasticsearch-0 -c elasticsearch -- curl -s -o /dev/null -w "%{http_code}\n" "localhost:9200/_ilm/policy/subfrost-cdn-delete-30d"
```
Expected: `"status":"green"`, then `200`, then `200`.

- [ ] **Step 5: Commit**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
git add k8s/telemetry/es-bootstrap-job.yaml
git commit -m "infra(telemetry): bootstrap also heals single-node yellow (replicas=0 on existing indices)"
```

---

### Task A2: Harden the ES StatefulSet for spot pre-emption

**Files:**
- Modify: `k8s/telemetry/elasticsearch.yaml` (pod spec + container probes)

**Context:** Root cause of the recurring outage: single-node ES + RWO PVC on a spot node; on pre-emption the volume stays attached to the dead node until force-detach (~1–6min). We keep spot (cheap, low-criticality), but (a) shrink the detach window via a short grace period so GKE graceful node-shutdown detaches cleanly, and (b) add a `startupProbe` so ES has room to recover from disk on reschedule before liveness can kill it.

- [ ] **Step 1: Add terminationGracePeriodSeconds**

In `k8s/telemetry/elasticsearch.yaml`, in the StatefulSet `spec.template.spec`, add a sibling to `tolerations`/`nodeSelector` (e.g. right after `securityContext: { fsGroup: 1000 }`):

```yaml
      # Spot: exit fast so GKE graceful node-shutdown detaches the RWO PVC
      # cleanly, shrinking the Multi-Attach window on reschedule.
      terminationGracePeriodSeconds: 30
```

- [ ] **Step 2: Add a startupProbe to the elasticsearch container**

In the same file, in the `elasticsearch` container, add alongside the existing `readinessProbe`/`livenessProbe`:

```yaml
          startupProbe:
            httpGet: { path: "/_cluster/health?local=true", port: http }
            failureThreshold: 30
            periodSeconds: 10
            initialDelaySeconds: 10
```

(Gives ES up to ~5min to come up from disk after a reschedule before liveness applies.)

- [ ] **Step 3: Validate the manifest**

Run: `bash "C:/Alkanes Geral Dev/.ioenv-extracted/kubectl-io.sh" apply --dry-run=server -f "C:/Alkanes Geral Dev/subfrost.io/k8s/telemetry/elasticsearch.yaml"`
Expected: Service/Service/StatefulSet `configured (server dry run)`, no error.

- [ ] **Step 4: Apply and verify the rolling update keeps ES Ready**

```bash
KIO="C:/Alkanes Geral Dev/.ioenv-extracted/kubectl-io.sh"
bash "$KIO" -n telemetry apply -f "C:/Alkanes Geral Dev/subfrost.io/k8s/telemetry/elasticsearch.yaml"
bash "$KIO" -n telemetry rollout status statefulset/elasticsearch --timeout=300s
bash "$KIO" -n telemetry get pod elasticsearch-0 -o jsonpath='{.spec.terminationGracePeriodSeconds}{"\n"}'
```
Expected: `statefulset rolling update complete` (or `partitioned roll out complete`), pod `1/1 Running`, grace period `30`. Note: the rollout re-creates the pod → expect a brief Multi-Attach window; wait it out (the startupProbe covers the disk recovery).

- [ ] **Step 5: Commit**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
git add k8s/telemetry/elasticsearch.yaml
git commit -m "infra(telemetry): harden ES for spot (terminationGracePeriod + startupProbe)"
```

---

### Task A3: ES→GCS DR snapshot CronJob

**Files:**
- Create: `k8s/telemetry/es-snapshot-cronjob.yaml`

**Context:** DR via daily full export to GCS (decided over native `_snapshot` to avoid the `repository-gcs` plugin / keystore on a frequently-rescheduling spot node). Reuses the reindex Job's tooling (`google/cloud-sdk:slim` + curl + jq + `gcloud storage`) and the `telemetry-reindex` KSA (Workload Identity). **The KSA's GSA currently has only `objectViewer` (read) on the bucket — the export needs write; Step 1 verifies/obtains it.**

- [ ] **Step 1: Verify the GSA can WRITE to the dump bucket (or grant it)**

```bash
KIO="C:/Alkanes Geral Dev/.ioenv-extracted/kubectl-io.sh"
bash "$KIO" -n telemetry run gcs-write-probe --restart=Never --rm -it \
  --image=google/cloud-sdk:slim --overrides='{"spec":{"serviceAccountName":"telemetry-reindex"}}' \
  -- bash -c 'echo probe > /tmp/p.txt && gcloud storage cp /tmp/p.txt gs://subfrost-docs/es-snapshots/_writeprobe.txt && echo WRITE_OK'
```
Expected: `WRITE_OK`. If it fails with a permissions error, the GSA needs `roles/storage.objectAdmin` on `gs://subfrost-docs` — grant it (requires an IAM admin; if io-sa cannot, escalate to Vitor/flex as a one-line dependency, and pause A3):
```bash
# run by someone with IAM admin on the project/bucket:
gcloud storage buckets add-iam-policy-binding gs://subfrost-docs \
  --member "serviceAccount:subfrost-io-k8s@night-wolves-jogging.iam.gserviceaccount.com" \
  --role roles/storage.objectAdmin
```

- [ ] **Step 2: Write the CronJob manifest**

Create `k8s/telemetry/es-snapshot-cronjob.yaml`:

```yaml
# Daily DR: full export of subfrost-cdn-*/subfrost-diagnostics-* to GCS as a
# tar.gz of per-index NDJSON (same shape as the handoff es-dump-*.tar.gz, so
# the existing reindex-job.yaml restores it). No repository-gcs plugin.
apiVersion: batch/v1
kind: CronJob
metadata:
  name: es-snapshot
  namespace: telemetry
  labels:
    app.kubernetes.io/component: es-snapshot
spec:
  schedule: "30 4 * * *"          # 04:30 UTC daily
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      backoffLimit: 2
      ttlSecondsAfterFinished: 172800
      template:
        metadata:
          labels:
            app.kubernetes.io/component: es-snapshot
        spec:
          restartPolicy: OnFailure
          serviceAccountName: telemetry-reindex
          containers:
            - name: snapshot
              image: google/cloud-sdk:slim
              env:
                - name: ES_URL
                  value: "http://elasticsearch.telemetry.svc.cluster.local:9200"
                - name: GCS_PREFIX
                  value: "gs://subfrost-docs/es-snapshots"
              command:
                - bash
                - -c
                - |
                  set -euo pipefail
                  command -v jq >/dev/null || { apt-get update -qq && apt-get install -y -qq jq; }
                  STAMP="$(date -u +%Y%m%d-%H%M%S)"
                  WORK="/work/$STAMP"; mkdir -p "$WORK"
                  echo "[1/3] waiting for ES"
                  until curl -fsS "$ES_URL/_cluster/health?wait_for_status=yellow&timeout=5s" >/dev/null; do sleep 3; done
                  echo "[2/3] exporting indices"
                  for idx in $(curl -fsS "$ES_URL/_cat/indices/subfrost-cdn-*,subfrost-diagnostics-*?h=index" | sort); do
                    [ -z "$idx" ] && continue
                    # dump mapping (wrapped under index name, matching the dump format)
                    curl -fsS "$ES_URL/$idx/_mapping" > "$WORK/$idx.mapping.json"
                    # scroll the full index into search-hit NDJSON (matches dump format)
                    : > "$WORK/$idx.data.ndjson"
                    body='{"size":2000,"query":{"match_all":{}}}'
                    resp="$(curl -fsS -X POST "$ES_URL/$idx/_search?scroll=2m" -H 'Content-Type: application/json' -d "$body")"
                    sid="$(echo "$resp" | jq -r '._scroll_id')"
                    echo "$resp" | jq -c '.hits.hits[]' >> "$WORK/$idx.data.ndjson"
                    while :; do
                      resp="$(curl -fsS -X POST "$ES_URL/_search/scroll" -H 'Content-Type: application/json' \
                        -d "{\"scroll\":\"2m\",\"scroll_id\":\"$sid\"}")"
                      n="$(echo "$resp" | jq '.hits.hits | length')"
                      [ "$n" = "0" ] && break
                      echo "$resp" | jq -c '.hits.hits[]' >> "$WORK/$idx.data.ndjson"
                      sid="$(echo "$resp" | jq -r '._scroll_id')"
                    done
                    curl -fsS -X DELETE "$ES_URL/_search/scroll" -H 'Content-Type: application/json' \
                      -d "{\"scroll_id\":[\"$sid\"]}" >/dev/null || true
                    echo "  exported $idx"
                  done
                  echo "[3/3] tar + upload"
                  TAR="/work/es-dump-$STAMP.tar.gz"
                  tar -czf "$TAR" -C "$WORK" .
                  gcloud storage cp "$TAR" "$GCS_PREFIX/es-dump-$STAMP.tar.gz"
                  echo "snapshot OK -> $GCS_PREFIX/es-dump-$STAMP.tar.gz"
              volumeMounts:
                - { name: work, mountPath: /work }
          volumes:
            - name: work
              emptyDir: { sizeLimit: 4Gi }
```

- [ ] **Step 3: Validate the manifest**

Run: `bash "C:/Alkanes Geral Dev/.ioenv-extracted/kubectl-io.sh" apply --dry-run=server -f "C:/Alkanes Geral Dev/subfrost.io/k8s/telemetry/es-snapshot-cronjob.yaml"`
Expected: `cronjob.batch/es-snapshot created (server dry run)`.

- [ ] **Step 4: Run it once manually and verify the GCS object**

```bash
KIO="C:/Alkanes Geral Dev/.ioenv-extracted/kubectl-io.sh"
bash "$KIO" -n telemetry apply -f "C:/Alkanes Geral Dev/subfrost.io/k8s/telemetry/es-snapshot-cronjob.yaml"
bash "$KIO" -n telemetry create job es-snapshot-manual --from=cronjob/es-snapshot
bash "$KIO" -n telemetry wait --for=condition=complete job/es-snapshot-manual --timeout=300s
bash "$KIO" -n telemetry logs job/es-snapshot-manual | tail -3
```
Expected: `snapshot OK -> gs://subfrost-docs/es-snapshots/es-dump-<stamp>.tar.gz`. Confirm the object exists (reuse the gcs-write-probe pattern with `gcloud storage ls gs://subfrost-docs/es-snapshots/`).

- [ ] **Step 5: Commit**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
git add k8s/telemetry/es-snapshot-cronjob.yaml
git commit -m "infra(telemetry): daily ES->GCS DR snapshot CronJob"
```

---

### Task A4: Trim the kustomization + wire the Flux Kustomization

**Files:**
- Modify: `k8s/telemetry/kustomization.yaml` (drop unused components)
- Modify: `clusters/subfrost-io/flux-kustomizations.yaml` (add `telemetry` Kustomization)

**Context:** The overlay currently lists RabbitMQ + cdn-telemetry-sink + external-secrets (unused — capture writes straight to ES) and is not in the Flux tree. We include only what we run, and add a dedicated Flux `Kustomization` so pushes to `main` reconcile `k8s/telemetry`. `prune: true` only removes what Flux itself applied, and the manifests match the live objects, so the first reconcile converges (it does NOT delete the live ES/PVC).

- [ ] **Step 1: Trim `k8s/telemetry/kustomization.yaml`**

Replace its `resources:` list so the file reads:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
# Telemetry stack overlay (Flux-managed via clusters/subfrost-io/flux-kustomizations.yaml).
# Capture writes straight to ES (no RabbitMQ/sink); the dump was already
# re-indexed (reindex-job stays in-tree for manual re-runs, out of this set).
namespace: telemetry
resources:
  - namespace.yaml
  - serviceaccount.yaml
  - elasticsearch.yaml
  - index-template-configmap.yaml
  - es-bootstrap-job.yaml
  - es-snapshot-cronjob.yaml
```

- [ ] **Step 2: Build the overlay locally**

Run: `bash "C:/Alkanes Geral Dev/.ioenv-extracted/kubectl-io.sh" kustomize "C:/Alkanes Geral Dev/subfrost.io/k8s/telemetry" > "C:/Users/vdto8/AppData/Local/Temp/claude/C--Alkanes-Geral-Dev/4794e405-4afc-4359-a0dc-719fa8d963bd/scratchpad/telemetry-build.yaml"; grep -c '^kind:' "C:/Users/vdto8/AppData/Local/Temp/claude/C--Alkanes-Geral-Dev/4794e405-4afc-4359-a0dc-719fa8d963bd/scratchpad/telemetry-build.yaml"`
Expected: a number ≥ 7 (ns, 2 services, statefulset, sa, configmap, job, cronjob) and no `rabbitmq`/`cdn-telemetry-sink` kinds in the output.

- [ ] **Step 3: Add the Flux Kustomization**

In `clusters/subfrost-io/flux-kustomizations.yaml`, append (and delete the trailing `NOTE: k8s/telemetry is intentionally NOT Flux-managed yet` comment block, now obsolete):

```yaml
---
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: telemetry
  namespace: flux-system
spec:
  interval: 10m
  retryInterval: 1m
  path: ./k8s/telemetry
  prune: true
  wait: true
  timeout: 5m
  sourceRef:
    kind: GitRepository
    name: subfrost-io
  dependsOn:
    - name: subfrost-io
```

- [ ] **Step 4: Server-dry-run the trimmed overlay against the cluster**

Run: `bash "C:/Alkanes Geral Dev/.ioenv-extracted/kubectl-io.sh" apply --dry-run=server -k "C:/Alkanes Geral Dev/subfrost.io/k8s/telemetry"`
Expected: every object `configured`/`unchanged`/`created (server dry run)` — confirm `statefulset.apps/elasticsearch configured` or `unchanged` (NOT a delete), proving Flux will converge the live ES, not replace it.

- [ ] **Step 5: Commit**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
git add k8s/telemetry/kustomization.yaml clusters/subfrost-io/flux-kustomizations.yaml
git commit -m "infra(telemetry): trim overlay to run set + wire Flux Kustomization"
```

- [ ] **Step 6: (Human-owned) merge + bootstrap the Flux CR + verify reconcile**

After merge to `main` (confirm with Vitor), apply the bootstrap CR once and nudge Flux:

```bash
KIO="C:/Alkanes Geral Dev/.ioenv-extracted/kubectl-io.sh"
bash "$KIO" apply -f "C:/Alkanes Geral Dev/subfrost.io/clusters/subfrost-io/flux-kustomizations.yaml"
bash "$KIO" -n flux-system annotate --overwrite gitrepository/subfrost-io reconcile.fluxcd.io/requestedAt="$(date -u +%FT%TZ)"
bash "$KIO" -n flux-system annotate --overwrite kustomization/telemetry reconcile.fluxcd.io/requestedAt="$(date -u +%FT%TZ)"
bash "$KIO" -n flux-system get kustomization telemetry
bash "$KIO" -n telemetry get pod elasticsearch-0
```
Expected: `kustomization/telemetry` `READY=True`; `elasticsearch-0` still `1/1 Running` (adopted, not recreated).

---

## Self-Review

- **Spec coverage:** A1 = heal yellow + apply template/ILM (spec §A2 + the 404 finding); A2 = harden spot (spec §A1); A3 = DR export→GCS (spec §A3, decision 6); A4 = trim + Flux wiring (spec §A4). All Part-A goals covered.
- **Out of scope (correctly absent):** no node-pool creation, no ECK/Helm, no RabbitMQ/sink, no `x.subfrost.io`/fp-server teardown.
- **Verification is live-cluster** (infra has no unit tests) — every task ends with a `kubectl-io.sh` check and a commit.
- **Dependency flagged:** A3 needs GSA write-IAM on `gs://subfrost-docs` (Step 1 obtains or escalates).
