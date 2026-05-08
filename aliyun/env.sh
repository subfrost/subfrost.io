#!/bin/bash
# Sourceable env loader for the aliyun/terraform stack.
#
#   source aliyun/env.sh
#   cd aliyun/terraform && terraform apply
#
# Bridges the Aliyun creds from ~/.bashrc (ALIYUN_ACCESS_ID + ALIYUN_ACCESS_KEY)
# to the names the Terraform alicloud provider expects.
# Pulls Cloudflare creds + zone id from ~/.subfrostcloudflarerc.

if [ -z "$ALIYUN_ACCESS_ID" ] || [ -z "$ALIYUN_ACCESS_KEY" ]; then
  # ~/.bashrc has the standard "if not interactive, return" guard, so
  # `source ~/.bashrc` no-ops in scripts. Pull just the exports we need.
  if [ -f ~/.bashrc ]; then
    eval "$(grep -E '^[[:space:]]*export[[:space:]]+(ALIYUN_ACCESS_ID|ALIYUN_ACCESS_KEY)=' ~/.bashrc)"
  fi
fi

export ALICLOUD_ACCESS_KEY="${ALICLOUD_ACCESS_KEY:-$ALIYUN_ACCESS_ID}"
export ALICLOUD_SECRET_KEY="${ALICLOUD_SECRET_KEY:-$ALIYUN_ACCESS_KEY}"

if [ -f "$HOME/.subfrostcloudflarerc" ]; then
  # shellcheck disable=SC1090
  source "$HOME/.subfrostcloudflarerc"
  export TF_VAR_cloudflare_zone_id="$CLOUDFLARE_ZONE_ID"
fi

# HK-only SSH key generated for the Aliyun ECS instances. Falls back to
# id_ed25519, then id_rsa, if the dedicated key isn't there yet.
for key in ~/.ssh/subfrost-hk.pub ~/.ssh/id_ed25519.pub ~/.ssh/id_rsa.pub; do
  if [ -f "$key" ]; then
    export TF_VAR_ssh_pubkey_path="$key"
    break
  fi
done

echo "aliyun env loaded:"
echo "  ALICLOUD_ACCESS_KEY = ${ALICLOUD_ACCESS_KEY:0:6}…"
echo "  ALICLOUD_SECRET_KEY = ${ALICLOUD_SECRET_KEY:0:6}…"
echo "  TF_VAR_cloudflare_zone_id = ${TF_VAR_cloudflare_zone_id:-<unset>}"
echo "  CLOUDFLARE_API_KEY = ${CLOUDFLARE_API_KEY:0:6}…"
echo "  CLOUDFLARE_EMAIL = ${CLOUDFLARE_EMAIL:-<unset>}"
