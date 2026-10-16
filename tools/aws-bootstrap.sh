#!/usr/bin/env bash
set -euo pipefail
domain=sitpa-54-167-108-112.sslip.io
nodebin=$(command -v node || command -v node-24)
npmbin=$(command -v npm || command -v npm-24)
ln -sf "$nodebin" /usr/local/bin/node
id sitpa >/dev/null 2>&1 || useradd --system --home-dir /srv/sitpa --shell /sbin/nologin sitpa
id caddy >/dev/null 2>&1 || useradd --system --home-dir /var/lib/caddy --create-home --shell /sbin/nologin caddy
install -d -m 755 /opt/sitpa /var/www/sitpa /etc/caddy
install -d -m 750 -o root -g sitpa /etc/sitpa
install -d -m 750 -o sitpa -g sitpa /srv/sitpa/data /srv/sitpa/backups
tar -xf /tmp/sitpa-aws-source.tar -C /opt/sitpa
tar -xf /tmp/sitpa-aws-web.tar -C /var/www/sitpa
tar -xf /tmp/sitpa-aws-private.tar -C /etc/sitpa
chown -R root:sitpa /etc/sitpa
chmod 640 /etc/sitpa/*
cd /opt/sitpa
"$npmbin" ci --include=dev --no-audit --no-fund
cd /etc/sitpa
if [ ! -f server.crt ]; then
  openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -subj '/CN=SITPA AWS Device CA' -keyout ca.key -out ca.crt >/dev/null 2>&1
  openssl req -newkey rsa:2048 -nodes -subj "/CN=$domain" -keyout server.key -out server.csr >/dev/null 2>&1
  printf 'subjectAltName=DNS:%s,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n' "$domain" > server.ext
  openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -days 365 -extfile server.ext -out server.crt >/dev/null 2>&1
fi
chown root:sitpa ca.crt server.crt server.key
chmod 640 ca.crt server.crt server.key
chmod 600 ca.key
grep -q "127.0.0.1 $domain" /etc/hosts || printf '\n127.0.0.1 %s\n' "$domain" >> /etc/hosts
cat > /etc/caddy/Caddyfile <<EOF
{
  acme_ca https://acme-v02.api.letsencrypt.org/directory
}
$domain {
  encode zstd gzip
  header X-Content-Type-Options nosniff
  header Referrer-Policy strict-origin-when-cross-origin
  @backend path /api/* /healthz /ws
  reverse_proxy @backend 127.0.0.1:8787
  root * /var/www/sitpa
  @config path /sitpa-config.json /sw.js /index.html /
  header @config Cache-Control no-store
  file_server
}
http://54.167.108.112, http://ec2-54-167-108-112.compute-1.amazonaws.com {
  redir https://$domain{uri} permanent
}
EOF
cat > /etc/systemd/system/caddy.service <<'EOF'
[Unit]
Description=SITPA HTTPS server
After=network-online.target
Wants=network-online.target
[Service]
User=caddy
Group=caddy
ExecStart=/usr/local/bin/caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
ExecReload=/usr/local/bin/caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
NoNewPrivileges=true
PrivateTmp=true
Restart=on-failure
[Install]
WantedBy=multi-user.target
EOF
cat > /etc/systemd/system/sitpa-broker.service <<'EOF'
[Unit]
Description=SITPA MQTT TLS broker
After=network-online.target
[Service]
User=sitpa
Group=sitpa
WorkingDirectory=/opt/sitpa
ExecStart=/usr/local/bin/node tools/aws-broker.mjs
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
[Install]
WantedBy=multi-user.target
EOF
cat > /etc/systemd/system/sitpa-backend.service <<'EOF'
[Unit]
Description=SITPA telemetry backend
After=network-online.target sitpa-broker.service
[Service]
User=sitpa
Group=sitpa
WorkingDirectory=/opt/sitpa/backend
EnvironmentFile=/etc/sitpa/backend.env
EnvironmentFile=-/etc/sitpa/push.env
ExecStart=/usr/local/bin/node src/server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/srv/sitpa/data
UMask=0077
[Install]
WantedBy=multi-user.target
EOF
cd /opt/sitpa
node --input-type=module - <<'JS'
import webpush from 'web-push';import {writeFileSync,existsSync} from 'node:fs';
if(!existsSync('/etc/sitpa/push.env')){const k=webpush.generateVAPIDKeys();writeFileSync('/etc/sitpa/push.env',`VAPID_PUBLIC_KEY=${k.publicKey}\nVAPID_PRIVATE_KEY=${k.privateKey}\nVAPID_SUBJECT=https://sitpa-54-167-108-112.sslip.io\n`,{mode:0o600});}
JS
find /var/www/sitpa -type d -exec chmod 755 {} +
find /var/www/sitpa -type f -exec chmod 644 {} +
/usr/local/bin/caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl daemon-reload
systemctl enable --now caddy sitpa-broker sitpa-backend
echo 'Servicios AWS instalados.'
