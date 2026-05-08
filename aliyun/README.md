# Aliyun HK deploy — meet-api + coturn

Two ECS instances in `cn-hongkong`, provisioned by Terraform. Cloudflare DNS for
`meet-hk.subfrost.io` and `turn-hk.subfrost.io`. No CDN proxy (would break LE +
TURN-TLS). Self-hosted Redis on the meet-api VM. coturn gets its own VM because
both services want TCP/443.

## Layout

```
aliyun/
├── terraform/
│   ├── main.tf              providers (alicloud, cloudflare, random)
│   ├── variables.tf         all knobs
│   ├── network.tf           VPC, vswitch, security groups
│   ├── compute.tf           2 ECS, 2 EIPs, key pair, secrets
│   ├── dns.tf               Cloudflare A records
│   ├── outputs.tf           IPs, FQDNs, secrets (sensitive)
│   └── cloud-init/
│       ├── meet-api.yaml.tpl
│       └── coturn.yaml.tpl
└── README.md (this file)
```

The compose stacks and Caddyfile / turnserver.conf are baked into the cloud-init
templates via `templatefile()` — no separate config repo to keep in sync.

## Prereqs

1. **Aliyun RAM access key** with permissions for ECS, VPC, EIP. The Terraform
   alicloud provider reads `ALICLOUD_ACCESS_KEY` + `ALICLOUD_SECRET_KEY`. If
   your shell already exports them under different names (e.g.
   `ALIYUN_ACCESS_ID` + `ALIYUN_ACCESS_KEY` from `~/.bashrc`), bridge them:

   ```sh
   export ALICLOUD_ACCESS_KEY="${ALICLOUD_ACCESS_KEY:-$ALIYUN_ACCESS_ID}"
   export ALICLOUD_SECRET_KEY="${ALICLOUD_SECRET_KEY:-$ALIYUN_ACCESS_KEY}"
   ```

   Or set them directly:
   ```sh
   export ALICLOUD_ACCESS_KEY=...
   export ALICLOUD_SECRET_KEY=...
   ```
   (Minimal IAM policy at end of this file.)

2. **Cloudflare creds** — already in `~/.subfrostcloudflarerc`:
   ```sh
   source ~/.subfrostcloudflarerc
   export TF_VAR_cloudflare_zone_id=$CLOUDFLARE_ZONE_ID
   ```
   The Terraform Cloudflare provider auto-picks up `CLOUDFLARE_API_KEY` +
   `CLOUDFLARE_EMAIL`.

3. **SSH pubkey** at `~/.ssh/id_ed25519.pub` (or set `-var ssh_pubkey_path=...`).

4. **GHCR image** — push the meet-api image first by merging to `main`. The
   workflow at `.github/workflows/meet-api-image.yml` builds + pushes
   `ghcr.io/subfrostdev/meet-api:latest`. The cloud-init pulls anonymously, so
   make the package public on GitHub once it exists (Settings → Packages →
   meet-api → Change visibility → Public). Or set `image_pull_secret` and
   modify the cloud-init to do `docker login`.

## Plan / apply

The repo includes `aliyun/env.sh`, a sourceable shim that:
- pulls `ALIYUN_ACCESS_ID` + `ALIYUN_ACCESS_KEY` out of `~/.bashrc` (handles the non-interactive guard) and re-exports them as `ALICLOUD_ACCESS_KEY` + `ALICLOUD_SECRET_KEY`
- sources `~/.subfrostcloudflarerc` and exports `TF_VAR_cloudflare_zone_id`

```sh
source aliyun/env.sh                  # bridges all creds
cd aliyun/terraform
terraform init
terraform plan
terraform apply
```

`apply` takes ~5 minutes for ECS provisioning, plus another 3-5 for cloud-init
(docker install, image pull, certbot, coturn start).

## Outputs

```sh
terraform output meet_api_ip
terraform output coturn_ip
terraform output -raw session_secret   # also baked into the meet-api VM
terraform output -raw turn_secret      # shared with coturn
terraform output ssh_meet_api
terraform output ssh_coturn
```

## Smoke test

After `apply`, give the VMs ~5 minutes to finish cloud-init:

```sh
# Health
curl -s https://meet-hk.subfrost.io/healthz

# Wallet challenge
curl -s -X POST https://meet-hk.subfrost.io/v1/auth/challenge \
  -H content-type:application/json \
  -d '{"address":"bc1q...","action":"join smoke"}'

# TURN reachability — replace USER:PASS with values from /v1/rtc/ice-config
nc -zv turn-hk.subfrost.io 443
nc -zv -u turn-hk.subfrost.io 3478
```

Browser-side WebRTC TURN check:
https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/

## Troubleshooting

```sh
# meet-api VM
ssh root@$(terraform output -raw meet_api_ip)
journalctl -u cloud-final --no-pager       # bootstrap logs
docker compose -f /etc/subfrost/compose.yaml logs -f
docker compose -f /etc/subfrost/compose.yaml ps

# coturn VM — most common issue is certbot failing on first boot
ssh root@$(terraform output -raw coturn_ip)
journalctl -u cloud-final --no-pager
ls /etc/letsencrypt/live/                  # should contain turn-hk.subfrost.io/
docker compose -f /etc/subfrost/coturn-compose.yaml logs -f

# If certbot didn't issue on first boot (DNS hadn't propagated yet),
# rerun manually:
certbot certonly --standalone --non-interactive --agree-tos \
  --register-unsafely-without-email -d turn-hk.subfrost.io
docker compose -f /etc/subfrost/coturn-compose.yaml restart coturn
```

## Day-2 ops

- **Bump meet-api image**: push to `main`, wait for the workflow, then on the
  meet-api VM: `docker compose -f /etc/subfrost/compose.yaml pull && docker compose -f /etc/subfrost/compose.yaml up -d`. (Or wire a webhook.)
- **Rotate session_secret**: `terraform apply -replace=random_password.session_secret`. This invalidates all live bearers — users re-auth with their wallet.
- **Rotate turn_secret**: same, `-replace=random_password.turn_secret`. Coturn picks up the new secret on container restart; in-flight TURN sessions drop.
- **Scale meet-api**: bump `meet_api_instance_type` and `terraform apply`. Add a second ECS + SLB later — Redis-backed signal bus and stateless bearers are already designed for it.

## Minimal IAM policy for the RAM key

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecs:*",
        "vpc:*",
        "eip:*",
        "ram:GetUser"
      ],
      "Resource": "*"
    }
  ]
}
```

Tighten further once the stack is stable — the above is permissive but
scope-limited to ECS/VPC/EIP.

## Cost rough-cut

| Item | Spec | Est. monthly |
|---|---|---|
| ECS meet-api | g7.large 2vCPU/8GB ESSD 40GB | ~$45 |
| ECS coturn | g7.large 2vCPU/8GB ESSD 40GB | ~$45 |
| EIP × 2 | PayByTraffic | $5 base + traffic |
| Bandwidth | 100+200 Mbps caps | varies (TURN-relayed media is the main driver) |
| **Total floor** | | **~$95/mo + traffic** |

Cheaper alternatives once running:
- Drop to `ecs.t6.large` ($25/mo each) — burstable CPU, fine for low-load early traffic.
- Switch to PayByBandwidth if traffic is steady.
