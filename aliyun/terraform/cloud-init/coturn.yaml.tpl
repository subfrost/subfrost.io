#cloud-config
# coturn VM bootstrap. Installs certbot, gets LE cert for turn FQDN, runs coturn
# in docker with cert mounts. cert auto-renewal via systemd timer + restart hook.

package_update: true
package_upgrade: false

packages:
  - ca-certificates
  - curl
  - gnupg
  - ufw
  - certbot

write_files:
  - path: /etc/subfrost/turnserver.conf
    permissions: "0600"
    owner: root:root
    content: |
      # ---------- Listening ----------
      listening-port=3478
      tls-listening-port=443
      alt-listening-port=0
      alt-tls-listening-port=0

      # The container has --network=host so we don't need an explicit listening-ip.

      # ---------- Auth ----------
      use-auth-secret
      static-auth-secret=${turn_secret}
      realm=${turn_fqdn}

      # ---------- TLS ----------
      cert=/etc/letsencrypt/live/${turn_fqdn}/fullchain.pem
      pkey=/etc/letsencrypt/live/${turn_fqdn}/privkey.pem

      # ---------- Relay ----------
      min-port=49152
      max-port=65535
      no-multicast-peers
      no-cli
      no-tlsv1
      no-tlsv1_1

      # Logging to stdout so docker logs surfaces it
      log-file=stdout
      verbose

      # Don't relay to private networks (defense in depth)
      denied-peer-ip=10.0.0.0-10.255.255.255
      denied-peer-ip=172.16.0.0-172.31.255.255
      denied-peer-ip=192.168.0.0-192.168.255.255

  - path: /etc/subfrost/coturn-compose.yaml
    permissions: "0644"
    owner: root:root
    content: |
      services:
        coturn:
          image: coturn/coturn:4.6
          restart: unless-stopped
          network_mode: host
          volumes:
            - /etc/subfrost/turnserver.conf:/etc/coturn/turnserver.conf:ro
            - /etc/letsencrypt:/etc/letsencrypt:ro
          command: ["-c", "/etc/coturn/turnserver.conf"]

  - path: /etc/letsencrypt/renewal-hooks/deploy/restart-coturn.sh
    permissions: "0755"
    owner: root:root
    content: |
      #!/bin/sh
      docker compose -f /etc/subfrost/coturn-compose.yaml restart coturn

runcmd:
  # Docker install
  - install -m 0755 -d /etc/apt/keyrings
  - curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  - chmod a+r /etc/apt/keyrings/docker.asc
  - echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
  - apt-get update
  - apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  - systemctl enable --now docker
  # ACME http-01 — needs port 80 free, before coturn starts.
  - certbot certonly --standalone --non-interactive --agree-tos --register-unsafely-without-email -d ${turn_fqdn} || echo "certbot initial run failed; manual run required"
  # Start coturn (will fail if cert wasn't issued; SSH in to debug)
  - docker compose -f /etc/subfrost/coturn-compose.yaml up -d
  - ufw allow 22/tcp
  - ufw allow 80/tcp
  - ufw allow 443/tcp
  - ufw allow 3478
  - ufw allow 49152:65535/udp
  - ufw --force enable

final_message: "coturn bootstrap complete in $UPTIME seconds"
