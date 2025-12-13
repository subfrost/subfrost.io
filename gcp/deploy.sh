#!/bin/bash
set -e

# ============================================
# Manual Deploy Script for Subfrost.io
# ============================================

PROJECT_ID="${GCP_PROJECT_ID:-subfrost-io-app}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="subfrost-io"
REPOSITORY="subfrost-docker"

echo "============================================"
echo "Deploying Subfrost.io to Cloud Run"
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "============================================"

# Set project
gcloud config set project "$PROJECT_ID"

# Configure Docker
echo "→ Configuring Docker for Artifact Registry..."
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

# Build and push
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${SERVICE_NAME}"
TAG=$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)

echo "→ Building Docker image..."
docker build -t "${IMAGE}:${TAG}" -t "${IMAGE}:latest" .

echo "→ Pushing Docker image..."
docker push "${IMAGE}:${TAG}"
docker push "${IMAGE}:latest"

# Get infrastructure info
SQL_CONNECTION=$(gcloud sql instances describe subfrost-postgres --format='value(connectionName)' 2>/dev/null || echo "")
REDIS_IP=$(gcloud redis instances describe subfrost-redis --region="$REGION" --format='value(host)' 2>/dev/null || echo "")

# Deploy to Cloud Run
echo "→ Deploying to Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
    --image "${IMAGE}:${TAG}" \
    --platform managed \
    --region "$REGION" \
    --allow-unauthenticated \
    --port 3000 \
    --cpu 1 \
    --memory 512Mi \
    --min-instances 0 \
    --max-instances 10 \
    --concurrency 80 \
    --timeout 60 \
    --vpc-connector subfrost-connector \
    --add-cloudsql-instances "$SQL_CONNECTION" \
    --set-env-vars "NODE_ENV=production" \
    --set-env-vars "NEXT_PUBLIC_NETWORK=mainnet" \
    --set-env-vars "REDIS_URL=redis://${REDIS_IP}:6379" \
    --set-secrets "DATABASE_URL=db-connection-string:latest"

# Get service URL
URL=$(gcloud run services describe "$SERVICE_NAME" \
    --region="$REGION" \
    --format='value(status.url)')

echo ""
echo "============================================"
echo "Deployment complete!"
echo "============================================"
echo ""
echo "Service URL: $URL"
echo "Image: ${IMAGE}:${TAG}"
echo ""
