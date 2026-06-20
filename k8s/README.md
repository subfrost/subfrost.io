# k8s — subfrost.io (new spot cluster, NOT subkube)

Deploys the single Next.js image (public site + `/admin` CMS + `/api`, plus the
`internal-api.subfrost.io` host) to a **new** GKE cluster on **spot** nodes.
`media-server` and `meet-api` are intentionally **not** here (dropped per flex).

> Status: **DRAFT** — fill the `REPLACE_*` placeholders once the cluster /
> project / registry are decided, then `kubectl apply -k k8s/`.

## What's in here

| File | Purpose |
|------|---------|
| `namespace.yaml` | `subfrost` namespace |
| `serviceaccount.yaml` | KSA `subfrost-io` + Workload Identity binding to a Google SA |
| `external-secrets.yaml` | Pull `AUTH_SECRET` / `DATABASE_URL` / `ADMIN_SECRET` from Secret Manager |
| `deployment.yaml` | App + Cloud SQL Auth Proxy (native sidecar) + `prisma db push` init |
| `service.yaml` | ClusterIP + BackendConfig (health check `/api/health`) |
| `ingress.yaml` | GCE Ingress + Google-managed TLS for both hosts |
| `pdb.yaml` | Keep ≥1 pod during disruptions/preemptions |
| `kustomization.yaml` | Ties it together + rewrites the image |

## Placeholders to fill

| Placeholder | Where | Value |
|-------------|-------|-------|
| `REPLACE_PROJECT_ID` | kustomization, external-secrets, SA comment | GCP project of the new cluster (today CMS lives in `night-wolves-jogging`) |
| `REPLACE_GSA_EMAIL` | serviceaccount | Google SA, e.g. `subfrost-io-k8s@<project>.iam.gserviceaccount.com` |
| `REPLACE_CLUSTER_NAME` / `REPLACE_CLUSTER_LOCATION` | external-secrets | New GKE cluster name + region |
| `REPLACE_CLOUDSQL_CONNECTION_NAME` | deployment | `PROJECT:REGION:subfrost-postgres` (region likely `us-central1`) |
| `REPLACE_STATIC_IP_NAME` | ingress | Name of a **global** static IP |
| `REPLACE_ADMIN_SECRET_NAME` | external-secrets | Secret Manager name holding `ADMIN_SECRET` |

Image is already wired to `us-central1-docker.pkg.dev/<project>/subfrost-docker/subfrost-io`
(matches `cloudbuild.yaml`); change `newTag` per release.

## One-time GCP setup

```bash
PROJECT=REPLACE_PROJECT_ID
# 1) Google SA for the app + Workload Identity
gcloud iam service-accounts create subfrost-io-k8s --project "$PROJECT"
GSA="subfrost-io-k8s@${PROJECT}.iam.gserviceaccount.com"
gcloud storage buckets add-iam-policy-binding gs://subfrost-cms \
  --member "serviceAccount:${GSA}" --role roles/storage.objectAdmin
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member "serviceAccount:${GSA}" --role roles/cloudsql.client
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member "serviceAccount:${GSA}" --role roles/secretmanager.secretAccessor
gcloud iam service-accounts add-iam-policy-binding "$GSA" \
  --role roles/iam.workloadIdentityUser \
  --member "serviceAccount:${PROJECT}.svc.id.goog[subfrost/subfrost-io]"

# 2) Global static IP for the Ingress, then point DNS A records at it
gcloud compute addresses create subfrost-io-ip --global --project "$PROJECT"

# 3) External Secrets Operator (or skip and create the Secret by hand, below)
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets external-secrets/external-secrets -n external-secrets --create-namespace
```

### DATABASE_URL + the proxy
The app talks to Postgres through the Cloud SQL Auth Proxy sidecar on
`127.0.0.1:5432`, so `DATABASE_URL` must use that host. If `db-connection-string`
in Secret Manager embeds the private IP instead, store a k8s value with host
`127.0.0.1:5432` (same db/user/password). If you'd rather skip External Secrets:

```bash
kubectl create secret generic subfrost-io-secrets -n subfrost \
  --from-literal=AUTH_SECRET=... \
  --from-literal=DATABASE_URL='postgresql://USER:PASS@127.0.0.1:5432/DB?schema=public' \
  --from-literal=ADMIN_SECRET=...
```

## Deploy — GitOps (Flux + Cloud Build), all via git push

Per flex, updates land via **git push** (the way "sablital" is organized): a
Cloud Build trigger builds the image (`../cloudbuild.yaml`) and **Flux**
reconciles these manifests from the repo it watches. Normal flow:

1. push to the app repo → Cloud Build builds & pushes the image to Artifact Registry
2. Flux applies/updates `k8s/` on the target cluster (image tag bumped by the
   pipeline, or by Flux image automation)

`kubectl apply -k k8s/` is only for first-time bootstrap / local testing:

```bash
kubectl apply -k k8s/
kubectl -n subfrost rollout status deploy/subfrost-io
```

The managed cert stays **Provisioning** until `subfrost.io`'s DNS points at the
static IP — so applying before DNS cutover is safe and won't disturb current
serving.

## Cluster probe (2026-06-19) — what already exists in `night-wolves-jogging`

| Cluster | Loc | Spot pool? | Notes |
|---------|-----|-----------|-------|
| `subfrost-admin` | us-central1-a | yes (`spot-pool`, e2-small) | Flux/subkube cluster flex said to AVOID |
| `subfrost-fdroid-cluster` | us-central1-a | no (e2-standard-2) | F-Droid; not for this |

Artifact Registry `subfrost-docker` @ us-central1 ✓ and Cloud SQL
`subfrost-postgres` @ us-central1 (RUNNABLE) ✓ already exist. **No dedicated
subfrost.io cluster yet.**

## Open questions for flex
- New cluster (NOT subkube) with a spot pool + Flux, or reuse one? (none dedicated today)
- Which repo does **Flux** watch for these manifests? (so `k8s/` lives there)
- Confirm the Secret Manager name backing `ADMIN_SECRET`.
- internal-api = internal (no public Ingress) — **confirmed**, done.
