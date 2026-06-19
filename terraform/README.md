# terraform — subfrost.io infra

Provisions the **new** (not subkube) GKE cluster on **spot** nodes that runs the
app, plus the IAM / Workload-Identity glue and the Ingress static IP. Cloud SQL
(`subfrost-postgres`) and Artifact Registry (`subfrost-docker`) already exist and
are referenced as data sources, **not** created.

Pairs with [`../k8s`](../k8s) — Terraform builds the cluster, Flux (watching
`subfrost/subfrost.io`) reconciles the manifests onto it.

## Creates

- Zonal GKE Standard cluster `subfrost-io` (us-central1-a) with Workload Identity
- A **spot** node pool (autoscaling 1–3, e2-medium); GKE auto-taints it
  `cloud.google.com/gke-spot`, which the k8s manifests tolerate
- Google SA `subfrost-io-k8s` + IAM: `objectAdmin` on `subfrost-cms`,
  `cloudsql.client`, `secretmanager.secretAccessor`, and the Workload Identity
  binding to KSA `subfrost/subfrost-io`
- Global static IP `subfrost-io-ip` for the Ingress
- Secret Manager container `cms-admin-secret` (value added out-of-band)

## Use

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars   # edit if needed
terraform init
terraform plan
terraform apply
```

`terraform output` then prints the values that fill the `k8s/` placeholders:
`app_service_account_email`, `ingress_static_ip_name`, `cloudsql_connection_name`.

## After apply

1. Add the ADMIN_SECRET value:
   `echo -n "$VALUE" | gcloud secrets versions add cms-admin-secret --data-file=-`
2. Get kube creds: see the `get_credentials_cmd` output.
3. Point `subfrost.io`'s DNS A record at `ingress_static_ip_address` to cut over
   from Cloud Run (managed cert provisions once DNS resolves).

## Caveats

- **Not run here** — no `terraform`/`gcloud` in this env, and `apply` is a prod
  mutation (flex/CI applies). HCL written by hand; run `terraform validate` +
  `terraform plan` before applying.
- **Networking**: defaults to the project's default VPC. The Cloud SQL proxy uses
  `--private-ip`, so the cluster needs VPC connectivity to `subfrost-postgres`'
  private IP (same VPC / private services access). Confirm or set
  `network`/`subnetwork`.
- Recommend a **GCS remote backend** (see `versions.tf`) before real use, so
  state isn't local-only.
