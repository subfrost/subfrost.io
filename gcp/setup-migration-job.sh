#!/bin/bash
set -e

# ============================================
# Setup Prisma Migration Cloud Run Job
# ============================================

PROJECT_ID="${GCP_PROJECT_ID:-subfrost-io-app}"
REGION="${GCP_REGION:-us-central1}"
JOB_NAME="prisma-migrate"
REPOSITORY="subfrost-docker"
SERVICE_NAME="subfrost-io"

echo "============================================"
echo "Setting up Prisma Migration Cloud Run Job"
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "============================================"

# Set project
gcloud config set project "$PROJECT_ID"

# Get infrastructure info
SQL_CONNECTION=$(gcloud sql instances describe subfrost-postgres --format='value(connectionName)' 2>/dev/null || echo "")

if [ -z "$SQL_CONNECTION" ]; then
    echo "Error: Cloud SQL instance 'subfrost-postgres' not found"
    echo "Please run ./gcp/setup.sh first"
    exit 1
fi

# Get the latest image
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${SERVICE_NAME}:latest"

echo "→ Creating/updating Cloud Run Job: $JOB_NAME"
echo "  Image: $IMAGE"
echo "  SQL Connection: $SQL_CONNECTION"

# Check if job exists
if gcloud run jobs describe "$JOB_NAME" --region="$REGION" > /dev/null 2>&1; then
    echo "  Job exists, updating..."
    ACTION="update"
else
    echo "  Job doesn't exist, creating..."
    ACTION="create"
fi

# Create or update the job
gcloud run jobs "$ACTION" "$JOB_NAME" \
    --region="$REGION" \
    --image="$IMAGE" \
    --max-retries=0 \
    --task-timeout=10m \
    --cpu=1 \
    --memory=512Mi \
    --vpc-connector=subfrost-connector \
    --add-cloudsql-instances="$SQL_CONNECTION" \
    --set-secrets="DATABASE_URL=db-connection-string:latest" \
    --set-env-vars="NODE_ENV=production" \
    --command="prisma" \
    --args="migrate,deploy,--schema=./prisma/schema.prisma"

echo ""
echo "============================================"
echo "Migration job setup complete!"
echo "============================================"
echo ""
echo "Job: $JOB_NAME"
echo "Region: $REGION"
echo ""
echo "To run migrations manually:"
echo "  gcloud run jobs execute $JOB_NAME --region=$REGION --wait"
echo ""
echo "To view job details:"
echo "  gcloud run jobs describe $JOB_NAME --region=$REGION"
echo ""
