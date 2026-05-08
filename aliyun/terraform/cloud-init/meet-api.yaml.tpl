#cloud-config
# meet-api VM bootstrap. Installs docker, writes compose stack, starts services.

package_update: true
package_upgrade: false

packages:
  - ca-certificates
  - curl
  - gnupg
  - ufw

write_files:
  - path: /etc/subfrost/meet-api.env
    permissions: "0600"
    owner: root:root
    content: |
      MEET_API_BIND=0.0.0.0:8080
      MEET_API_SESSION_SECRET=${session_secret}
      MEET_API_TURN_SECRET=${turn_secret}
      MEET_API_TURN_URLS=turn:${turn_fqdn}:3478,turns:${turn_fqdn}:443?transport=tcp
      MEET_API_TURN_TTL_SECS=3600
      MEET_API_BEARER_TTL_MS=86400000
      MEET_API_REDIS_URL=redis://redis:6379
      MEET_API_CHALLENGE_TTL_SECS=300
      RUST_LOG=meet_api=info,tower_http=info

  - path: /etc/subfrost/compose.yaml
    permissions: "0644"
    owner: root:root
    content: |
      services:
        meet-api:
          image: ${image}
          restart: unless-stopped
          env_file: /etc/subfrost/meet-api.env
          depends_on:
            - redis
          networks: [internal]

        redis:
          image: redis:7-alpine
          restart: unless-stopped
          command: ["redis-server", "--appendonly", "no", "--save", ""]
          networks: [internal]

        caddy:
          image: caddy:2-alpine
          restart: unless-stopped
          ports:
            - "80:80"
            - "443:443"
          volumes:
            - /etc/subfrost/Caddyfile:/etc/caddy/Caddyfile:ro
            - caddy_data:/data
            - caddy_config:/config
          depends_on:
            - meet-api
          networks: [internal]

      networks:
        internal:

      volumes:
        caddy_data:
        caddy_config:

  - path: /etc/subfrost/Caddyfile
    permissions: "0644"
    owner: root:root
    content: |
      ${meet_fqdn} {
        encode gzip zstd
        reverse_proxy meet-api:8080
        log {
          output stdout
          format console
        }
      }

runcmd:
  # Install Docker (official repo)
  - install -m 0755 -d /etc/apt/keyrings
  - curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  - chmod a+r /etc/apt/keyrings/docker.asc
  - echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
  - apt-get update
  - apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  - systemctl enable --now docker
  # Pull and start the stack
  - docker compose -f /etc/subfrost/compose.yaml pull
  - docker compose -f /etc/subfrost/compose.yaml up -d
  # Basic firewall on the host as belt-and-suspenders alongside the SG
  - ufw allow 22/tcp
  - ufw allow 80/tcp
  - ufw allow 443/tcp
  - ufw --force enable

final_message: "meet-api bootstrap complete in $UPTIME seconds"
