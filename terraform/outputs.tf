# These outputs feed the REPLACE_* placeholders in k8s/.
output "cluster_name" {
  value = google_container_cluster.subfrost_io.name
}

output "cluster_location" {
  value = google_container_cluster.subfrost_io.location
}

output "app_service_account_email" {
  description = "→ k8s/serviceaccount.yaml (iam.gke.io/gcp-service-account)"
  value       = google_service_account.app.email
}

output "ingress_static_ip_name" {
  description = "→ k8s/ingress.yaml (kubernetes.io/ingress.global-static-ip-name)"
  value       = google_compute_global_address.ingress.name
}

output "ingress_static_ip_address" {
  description = "Point subfrost.io's DNS A record at this."
  value       = google_compute_global_address.ingress.address
}

output "cloudsql_connection_name" {
  description = "→ k8s/deployment.yaml (Cloud SQL Auth Proxy arg)"
  value       = data.google_sql_database_instance.postgres.connection_name
}

output "get_credentials_cmd" {
  value = "gcloud container clusters get-credentials ${google_container_cluster.subfrost_io.name} --zone ${var.zone} --project ${var.project_id}"
}
