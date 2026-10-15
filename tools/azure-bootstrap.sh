#!/usr/bin/env bash
set -euo pipefail
# Run as root on the dedicated Ubuntu VM. Never formats a disk with a signature.
disk=/dev/disk/azure/scsi1/lun0
mkdir -p /srv/sitpa
if ! mountpoint -q /srv/sitpa; then
  if ! blkid "$disk" >/dev/null 2>&1; then
    test -z "$(wipefs -n --noheadings "$disk")"
    mkfs.ext4 -L sitpa-data "$disk"
  fi
  test "$(blkid -s TYPE -o value "$disk")" = ext4
  uuid=$(blkid -s UUID -o value "$disk")
  grep -q "$uuid" /etc/fstab || echo "UUID=$uuid /srv/sitpa ext4 defaults 0 2" >> /etc/fstab
  mount /srv/sitpa
fi
if ! command -v node >/dev/null || ! node --version | grep -q '^v24\.'; then
  cd /tmp
  python3 - <<'PY'
import urllib.request,json,hashlib,tarfile
releases=json.load(urllib.request.urlopen('https://nodejs.org/dist/index.json'))
v=next(r['version'] for r in releases if r['version'].startswith('v24.'))
name=f'node-{v}-linux-x64.tar.xz'
base=f'https://nodejs.org/dist/{v}/'
data=urllib.request.urlopen(base+name).read()
sums=urllib.request.urlopen(base+'SHASUMS256.txt').read().decode()
expected=next(line.split()[0] for line in sums.splitlines() if line.endswith('  '+name))
assert hashlib.sha256(data).hexdigest()==expected
open('/tmp/'+name,'wb').write(data)
with tarfile.open('/tmp/'+name) as t: t.extractall('/opt',filter='data')
open('/tmp/sitpa-node-dir','w').write('/opt/'+name.removesuffix('.tar.xz'))
PY
  node_dir=$(cat /tmp/sitpa-node-dir)
  ln -sfn "$node_dir/bin/node" /usr/local/bin/node
  ln -sfn "$node_dir/bin/npm" /usr/local/bin/npm
  ln -sfn "$node_dir/bin/npx" /usr/local/bin/npx
fi
id sitpa >/dev/null 2>&1 || useradd --system --home /opt/sitpa --shell /usr/sbin/nologin sitpa
install -d -m 755 /opt/sitpa /srv/sitpa/data /srv/sitpa/backups /var/www/sitpa
chown sitpa:sitpa /srv/sitpa/data /srv/sitpa/backups
install -d -m 700 /etc/sitpa
node --version
df -h /srv/sitpa
