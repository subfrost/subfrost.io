# Zonal GKE Standard cluster (cheap: single control plane) with Workload
# Identity. The default node pool is removed so we manage one spot pool
# explicitly. NOT subkube — this is the dedicated subfrost.io cluster.
#
# NOTE on networking: omitting network/subnetwork uses the project's default
# VPC. The Cloud SQL Auth Proxy runs with --private-ip, so the cluster MUST have
# VPC connectivity to subfrost-postgres' private IP (same VPC / private services
# access). Confirm that, or set network/subnetwork to the VPC peered with
# Cloud SQL.
resource "google_container_cluster" "subfrost_io" {
  name     = var.cluster_name
  location = var.zone

  remove_default_node_pool = true
  initial_node_count       = 1

  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }

  release_channel {
    channel = "REGULAR"
  }

  # Easy teardown while iterating; flip to true once this is the real cluster.
  deletion_protection = false
}

resource "google_container_node_pool" "spot" {
  name     = "spot-pool"
  location = var.zone
  cluster  = google_container_cluster.subfrost_io.name

  autoscaling {
    min_node_count = var.spot_min_nodes
    max_node_count = var.spot_max_nodes
  }

  management {
    auto_repair  = true
    auto_upgrade = true
  }

  node_config {
    spot         = true
    machine_type = var.spot_machine_type
    disk_size_gb = 30
    disk_type    = "pd-standard"

    oauth_scopes = ["https://www.googleapis.com/auth/cloud-platform"]

    # Required for Workload Identity on the nodes.
    workload_metadata_config {
      mode = "GKE_METADATA"
    }

    # GKE auto-taints spot nodes cloud.google.com/gke-spot=true:NoSchedule,
    # which the k8s/ Deployment tolerates + selects.
  }
}
