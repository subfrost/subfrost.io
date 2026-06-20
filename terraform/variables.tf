variable "project_id" {
  description = "GCP project for the cluster. Cloud SQL + Artifact Registry already live here."
  type        = string
  default     = "night-wolves-jogging"
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "zone" {
  description = "Zonal cluster = one control plane = cheaper. Existing clusters + Cloud SQL are us-central1-a."
  type        = string
  default     = "us-central1-a"
}

variable "cluster_name" {
  type    = string
  default = "subfrost-io"
}

variable "spot_machine_type" {
  type    = string
  default = "e2-medium"
}

variable "spot_min_nodes" {
  type    = number
  default = 1
}

variable "spot_max_nodes" {
  # e2-medium is small (~940m allocatable, ~half eaten by GKE system pods), so
  # one app pod ≈ one node. 2 replicas + ESO + rollout surge need headroom; 5
  # gives the autoscaler room. (Future: fewer, bigger nodes — e.g. e2-standard-2
  # — would be more efficient, but that recreates the pool.)
  type    = number
  default = 5
}

variable "cms_bucket" {
  description = "GCS bucket the CMS uploads to (already exists; not created here)."
  type        = string
  default     = "subfrost-cms"
}

variable "cloudsql_instance" {
  description = "Existing Cloud SQL instance (private IP)."
  type        = string
  default     = "subfrost-postgres"
}

variable "k8s_namespace" {
  type    = string
  default = "subfrost"
}

variable "k8s_service_account" {
  description = "Name of the KSA the app runs as (see k8s/serviceaccount.yaml)."
  type        = string
  default     = "subfrost-io"
}
