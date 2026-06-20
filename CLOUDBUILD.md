# Cloud Build — subfrost.io stack

Build configs for every container in the stack. Each builds an image and pushes
it to Artifact Registry. **Deploy to k8s is intentionally not in these files** —
wire that on the cluster side (Flux or a `kubectl`/`gke-deploy` step) once the
target cluster is decided. Per flex: this is a **new** cluster (not `subkube`),
running cheap on **spot VMs**.

## Files

| Container | Config | Build context | Default image | Port |
|-----------|--------|---------------|---------------|------|
| Next.js app (`subfrost.io` + `/admin` + API) | `cloudbuild.yaml` | repo root | `subfrost-io` | 3000 |
| Media server (HLS ingest/transcode) | `media-server/cloudbuild.yaml` | `media-server/` | `subfrost-media-server` | 8080 |
| meet-api (Rust WebRTC/TURN) | `rust/services/meet-api/cloudbuild.yaml` | repo root | `meet-api` | 8080 |

Images are pushed to:
`${_REGION}-docker.pkg.dev/$PROJECT_ID/${_REPOSITORY}/<image>:{$SHORT_SHA, latest}`

## Substitutions (override per trigger if needed)

- `_REGION` — default `us-central1`
- `_REPOSITORY` — Artifact Registry repo, default `subfrost-docker`
- `_IMAGE` — image name (defaulted per file)

`$PROJECT_ID` and `$SHORT_SHA` are provided by Cloud Build automatically.

## One-time setup (per target project)

```bash
gcloud services enable cloudbuild.googleapis.com artifactregistry.googleapis.com
gcloud artifacts repositories create subfrost-docker \
  --repository-format=docker --location=us-central1
```

Grant the Cloud Build SA permission to push:
`roles/artifactregistry.writer` (and `roles/container.developer` if you later add
a k8s deploy step).

## Wiring triggers (GCP console → Cloud Build → Triggers → Create)

Create one trigger per service, each pointing at its config file with a **path
filter** so unrelated commits don't rebuild everything:

| Trigger | Config file | Included files (path filter) |
|---------|-------------|------------------------------|
| app | `cloudbuild.yaml` | `app/**`, `components/**`, `lib/**`, `actions/**`, `prisma/**`, `public/**`, `Dockerfile`, `next.config.mjs`, `package.json`, `pnpm-lock.yaml`, `cloudbuild.yaml` |
| media-server | `media-server/cloudbuild.yaml` | `media-server/**` |
| meet-api | `rust/services/meet-api/cloudbuild.yaml` | `rust/**` |

CLI equivalent (example, app trigger on push to `main`):

```bash
gcloud builds triggers create github \
  --name=subfrost-io-app \
  --repo-name=subfrost.io --repo-owner=subfrost \
  --branch-pattern='^main$' \
  --build-config=cloudbuild.yaml \
  --included-files='app/**,components/**,lib/**,actions/**,prisma/**,public/**,Dockerfile,next.config.mjs,package.json,pnpm-lock.yaml,cloudbuild.yaml'
```

## Notes

- **Cheap by default:** no custom `machineType` is set, so builds use the default
  pool (free-tier eligible). If the Next.js or Rust build is too slow, add
  `options.machineType: E2_HIGHCPU_8` to that file.
- **Caching:** each build pulls `:latest` and passes `--cache-from`, so layer
  reuse works across builds (meet-api also sets `BUILDKIT_INLINE_CACHE=1`).
- **Spot VMs** apply to the GKE node pool the workloads run on — a cluster/node
  setting, not a Cloud Build setting.
- **internal-api.subfrost.io** is the app's API surface (`/api/*`) exposed on its
  own Ingress host; it does not need a separate image — same `subfrost-io` image.
