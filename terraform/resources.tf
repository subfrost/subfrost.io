# Global static IP for the GKE Ingress. Point subfrost.io's A record here when
# ready to cut over from Cloud Run.
resource "google_compute_global_address" "ingress" {
  name = "subfrost-io-ip"
}

# Container for ADMIN_SECRET — none exists in Secret Manager yet (today it's an
# inline env on Cloud Run). Add the value out-of-band after apply:
#   echo -n "$VALUE" | gcloud secrets versions add cms-admin-secret --data-file=-
resource "google_secret_manager_secret" "admin_secret" {
  secret_id = "cms-admin-secret"
  replication {
    auto {}
  }
}

# ---- Existing infra, referenced (NOT created here) ----
data "google_sql_database_instance" "postgres" {
  name = var.cloudsql_instance
}

data "google_artifact_registry_repository" "docker" {
  location      = var.region
  repository_id = "subfrost-docker"
}
