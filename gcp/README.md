# GCP Infrastructure Setup

This directory contains scripts for setting up and deploying Subfrost.io on Google Cloud Platform.

## Prerequisites

1. A GCP project with billing enabled (use project ID: `subfrost-io-app`)
2. `gcloud` CLI installed and configured
3. Docker installed locally

## Quick Start

```bash
# 1. Authenticate with GCP
gcloud auth login
gcloud auth application-default login

# 2. Set environment variables
export GCP_PROJECT_ID="subfrost-io-app"
export GITHUB_ORG="your-github-org"
export GITHUB_REPO="subfrost.io"

# 3. Run setup script (creates Cloud SQL, Redis, etc.)
./gcp/setup.sh

# 4. Setup GitHub Workload Identity Federation
./gcp/setup-github-wif.sh

# 5. Add GitHub secrets (output from step 4)
# Go to GitHub repo → Settings → Secrets and variables → Actions

# 6. Push to main branch to trigger deployment
git push origin main
```

## Scripts

### `setup.sh`

Creates all required GCP infrastructure:
- Cloud SQL PostgreSQL instance
- Cloud Memorystore Redis instance
- VPC Connector for private networking
- Artifact Registry for Docker images
- Secret Manager secrets

### `setup-github-wif.sh`

Configures Workload Identity Federation for secure GitHub Actions authentication:
- Creates Workload Identity Pool
- Creates OIDC Provider for GitHub
- Creates Service Account with required permissions
- Outputs GitHub secrets to configure

### `deploy.sh`

Manual deployment script for local development:
- Builds Docker image
- Pushes to Artifact Registry
- Deploys to Cloud Run

## Architecture

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│  GitHub Push    │ ──▶  │  GitHub Actions  │ ──▶  │   Cloud Run     │
│  (main branch)  │      │  (Build & Test)  │      │   (Deploy)      │
└─────────────────┘      └──────────────────┘      └─────────────────┘
                                  │                       │
                                  ▼                       ▼
                         ┌──────────────────┐     ┌─────────────────┐
                         │ Artifact Registry│     │   Cloud SQL     │
                         │ (Docker Images)  │     │  (PostgreSQL)   │
                         └──────────────────┘     └─────────────────┘
                                                         │
                                                         ▼
                                                  ┌─────────────────┐
                                                  │ Cloud Memorystore│
                                                  │    (Redis)      │
                                                  └─────────────────┘
```

## Environment Variables

### Cloud Run (Production)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (via Secret Manager) |
| `REDIS_URL` | Redis connection URL |
| `NODE_ENV` | Set to `production` |
| `NEXT_PUBLIC_NETWORK` | Bitcoin network (mainnet/testnet) |

### GitHub Secrets

| Secret | Description |
|--------|-------------|
| `GCP_PROJECT_ID` | Your GCP project ID |
| `WIF_PROVIDER` | Workload Identity Provider resource name |
| `WIF_SERVICE_ACCOUNT` | Service account email for GitHub Actions |

## Cost Optimization

1. **Cloud Run:** Uses scale-to-zero (`--min-instances 0`)
2. **Cloud SQL:** Uses `db-f1-micro` tier for development (upgrade for production)
3. **Redis:** Uses `basic` tier with 1GB (upgrade for production)

## Troubleshooting

### Check Cloud Run logs
```bash
gcloud run services logs read subfrost-io --region=us-central1 --limit=50
```

### Check service status
```bash
gcloud run services describe subfrost-io --region=us-central1
```

### Test database connection
```bash
gcloud sql connect subfrost-postgres --user=subfrost --database=subfrost
```
