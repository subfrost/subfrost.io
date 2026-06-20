# Google SA the app runs as via Workload Identity, + the minimum roles it needs.
resource "google_service_account" "app" {
  account_id   = "subfrost-io-k8s"
  display_name = "subfrost.io app (GKE Workload Identity)"
}

# Bind the in-cluster KSA (subfrost/subfrost-io) to this Google SA.
resource "google_service_account_iam_member" "workload_identity" {
  service_account_id = google_service_account.app.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[${var.k8s_namespace}/${var.k8s_service_account}]"
}

# CMS uploads: object admin scoped to the one bucket (not project-wide).
resource "google_storage_bucket_iam_member" "cms_bucket" {
  bucket = var.cms_bucket
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.app.email}"
}

# Cloud SQL Auth Proxy.
resource "google_project_iam_member" "cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.app.email}"
}

# Read secrets via External Secrets (Workload Identity).
resource "google_project_iam_member" "secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.app.email}"
}
