#!/usr/bin/env bash
set -euo pipefail
domain=${1:?Pass the DNS name shown by Azure}
[[ "$domain" =~ ^[a-z0-9.-]+$ ]] || exit 1
# Require DNS before requesting a certificate to avoid failed issuance attempts.
getent ahostsv4 "$domain" | awk '{print $1}' | grep -qx '57.156.38.0'
sed "s/SITPA_DOMAIN/$domain/g" /tmp/azure-nginx.conf.template > /etc/nginx/sites-available/sitpa
nginx -t
systemctl reload nginx
certbot --nginx -d "$domain" --non-interactive --agree-tos --register-unsafely-without-email --redirect --key-type rsa
python3 /tmp/azure-configure.py "$domain"
python3 - "$domain" <<'PY'
import json,sys,pathlib
p=pathlib.Path('/var/www/sitpa/sitpa-config.json')
d=json.loads(p.read_text()); d['apiBaseUrl']='https://'+sys.argv[1]
p.write_text(json.dumps(d,indent=2)+'\n')
PY
for attempt in {1..15}; do
  if curl -fsS "https://$domain/healthz"; then break; fi
  sleep 2
done
curl -fsS "https://$domain/healthz"
systemctl start sitpa-backup.service
systemctl is-active nginx mosquitto sitpa-backend
echo "Deployment ready at https://$domain"
