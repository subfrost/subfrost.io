terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }

  # Recommended: GCS remote state. Create the bucket once, then uncomment.
  # backend "gcs" {
  #   bucket = "subfrost-tf-state"
  #   prefix = "subfrost-io"
  # }
}

provider "google" {
  project = var.project_id
  region  = var.region
}
