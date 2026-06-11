# news.subfrost.io — Kubernetes manifests

Deploys the `news/` Next.js app to the **`subfrost-admin`** GKE cluster in the
`night-wolves-jogging` project (same cluster as `admin/docs/sign.subfrost.io`).
Fronted by Cloudflare (proxied) → nginx-ingress → this Service. TLS is issued by
cert-manager (`letsencrypt-prod`, DNS-01 via Cloudflare).

Postgres is the shared `subfrost-postgres` Cloud SQL instance, database `news`,
reached through a Cloud SQL Auth Proxy sidecar (native sidecar / `restartPolicy:
Always`).

## Files

| File | Purpose |
|------|---------|
| `00-namespace.yaml`        | `news` namespace |
| `10-secrets.example.yaml`  | TEMPLATE for `news-secrets` + `cloudsql-sa` (do not commit real values) |
| `20-deployment.yaml`       | app Deployment + Cloud SQL Auth Proxy sidecar |
| `30-service.yaml`          | ClusterIP Service |
| `40-ingress.yaml`          | nginx Ingress + cert-manager TLS for `news.subfrost.io` |
| `50-migrate-job.yaml`      | `prisma db push` Job |

## One-time setup

```sh
source ~/.ioenv
gcloud container clusters get-credentials subfrost-admin --zone us-central1-a --project night-wolves-jogging

# Least-privilege SA for the Cloud SQL proxy
gcloud iam service-accounts create news-sql-client --display-name "news Cloud SQL client"
gcloud projects add-iam-policy-binding night-wolves-jogging \
  --member "serviceAccount:news-sql-client@night-wolves-jogging.iam.gserviceaccount.com" \
  --role roles/cloudsql.client
gcloud iam service-accounts keys create /tmp/news-sql-client.json \
  --iam-account news-sql-client@night-wolves-jogging.iam.gserviceaccount.com

kubectl apply -f 00-namespace.yaml

# Secrets (values from ~/subfrost.io/.secrets/news.env)
kubectl -n news create secret generic cloudsql-sa --from-file=key.json=/tmp/news-sql-client.json
kubectl -n news create secret generic news-secrets \
  --from-literal=DATABASE_URL="postgresql://news:PASS@127.0.0.1:5432/news?schema=public&sslmode=disable" \
  --from-literal=AUTH_SECRET="$(openssl rand -hex 32)" \
  --from-literal=AUTH_URL="https://news.subfrost.io" \
  --from-literal=NEXTAUTH_URL="https://news.subfrost.io"
```

## Deploy

```sh
kubectl apply -f 30-service.yaml -f 20-deployment.yaml -f 40-ingress.yaml
# schema (idempotent)
kubectl delete job news-migrate -n news --ignore-not-found
kubectl apply -f 50-migrate-job.yaml
```

CI (`.github/workflows/news-deploy.yml`) builds the image, pushes to Artifact
Registry, and `kubectl set image` rolls the Deployment.
