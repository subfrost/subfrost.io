#!/bin/bash
set -e

# ============================================
# Add Cloud SQL Viewer role to GitHub Actions SA
# ============================================

PROJECT_ID="${GCP_PROJECT_ID:-subfrost-io-app}"
SA_NAME="github-actions"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "============================================"
echo "Adding Cloud SQL Viewer role"
echo "Project: $PROJECT_ID"
echo "Service Account: $SA_EMAIL"
echo "============================================"

# Set project
gcloud config set project "$PROJECT_ID"

# Add the missing role
echo "→ Adding roles/cloudsql.viewer..."
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/cloudsql.viewer" \
    --quiet

echo ""
echo "✓ Permission added successfully!"
echo ""
echo "The GitHub Actions workflow should now be able to:"
echo "  - Describe Cloud SQL instances"
echo "  - Get SQL connection names"
echo "  - Run database schema sync jobs"
echo ""
