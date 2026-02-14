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

# Update Cloudflare DNS if configured
if [ -n "$CLOUDFLARE_API_TOKEN" ] && [ -n "$CLOUDFLARE_DOMAIN" ]; then
    echo "→ Updating Cloudflare DNS..."

    DOMAIN="$CLOUDFLARE_DOMAIN"
    # Google Cloud Run domain mapping IP
    TARGET="216.239.32.21"

    # Get Zone ID
    if [ -n "$CLOUDFLARE_ZONE_ID" ]; then
        CF_ZONE_ID="$CLOUDFLARE_ZONE_ID"
    else
        ROOT_DOMAIN=$(echo "$DOMAIN" | awk -F. '{print $(NF-1)"."$NF}')
        CF_ZONE_ID=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones?name=${ROOT_DOMAIN}" \
            -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
            -H "Content-Type: application/json" | jq -r '.result[0].id')

        if [ "$CF_ZONE_ID" = "null" ] || [ -z "$CF_ZONE_ID" ]; then
            echo "Warning: Could not find Cloudflare zone for ${ROOT_DOMAIN}"
            echo "Skipping DNS update. Set CLOUDFLARE_ZONE_ID manually."
        fi
    fi

    if [ -n "$CF_ZONE_ID" ] && [ "$CF_ZONE_ID" != "null" ]; then
        # Check for existing record
        RESPONSE=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records?name=${DOMAIN}" \
            -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
            -H "Content-Type: application/json")

        RECORD_ID=$(echo "$RESPONSE" | jq -r '.result[] | select(.type == "A" or .type == "CNAME") | .id' | head -1)

        if [ -n "$RECORD_ID" ]; then
            # Update existing record
            curl -s -X PUT "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records/${RECORD_ID}" \
                -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
                -H "Content-Type: application/json" \
                --data "{\"type\":\"A\",\"name\":\"${DOMAIN}\",\"content\":\"${TARGET}\",\"ttl\":1,\"proxied\":true}" > /dev/null
            echo "Updated A record: ${DOMAIN} -> ${TARGET}"
        else
            # Create new record
            curl -s -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records" \
                -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
                -H "Content-Type: application/json" \
                --data "{\"type\":\"A\",\"name\":\"${DOMAIN}\",\"content\":\"${TARGET}\",\"ttl\":1,\"proxied\":true}" > /dev/null
            echo "Created A record: ${DOMAIN} -> ${TARGET}"
        fi
    fi
else
    echo "Note: Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_DOMAIN to auto-update DNS"
fi

echo ""
echo "============================================"
echo "Deployment complete!"
echo "============================================"
echo ""
echo "Service URL: $URL"
if [ -n "$CLOUDFLARE_DOMAIN" ]; then
    echo "Custom Domain: https://${CLOUDFLARE_DOMAIN}"
fi
echo "Image: ${IMAGE}:${TAG}"
echo ""
