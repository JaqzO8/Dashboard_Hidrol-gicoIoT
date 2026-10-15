#!/usr/bin/env python3
"""Configure the dedicated VM after deploying code and issuing its TLS certificate."""
import os, pathlib, secrets, subprocess, sys

domain=sys.argv[1]
internal_mqtt = '--internal-mqtt' in sys.argv
if not all(c.isalnum() or c in '.-' for c in domain): raise ValueError('Invalid hostname')
def write(path,text,mode=0o644):
    p=pathlib.Path(path); p.parent.mkdir(parents=True,exist_ok=True); p.write_text(text); p.chmod(mode)
def run(*args): subprocess.run(args,check=True)
secret=pathlib.Path('/etc/sitpa/mqtt-passwords')
if not secret.exists():
    write(str(secret),f'tingomaria-01:{secrets.token_hex(32)}\nsitpa-backend:{secrets.token_hex(32)}\n',0o600)
accounts=dict(line.split(':',1) for line in secret.read_text().splitlines())
write('/etc/mosquitto/passwords',secret.read_text(),0o600)
run('mosquitto_passwd','-U','/etc/mosquitto/passwords')
run('chown','mosquitto:mosquitto','/etc/mosquitto/passwords')
run('cp','/opt/sitpa/backend/broker/acl.example','/etc/mosquitto/sitpa-acl')
write('/etc/letsencrypt/renewal-hooks/deploy/sitpa',f'''#!/bin/sh
set -eu
install -d -m 750 -o root -g mosquitto /etc/mosquitto/certs
install -m 640 -o root -g mosquitto /etc/letsencrypt/live/{domain}/fullchain.pem /etc/mosquitto/certs/fullchain.pem
install -m 640 -o root -g mosquitto /etc/letsencrypt/live/{domain}/privkey.pem /etc/mosquitto/certs/privkey.pem
systemctl restart mosquitto
systemctl reload nginx
''',0o750)
write('/etc/mosquitto/conf.d/sitpa.conf','''listener 8883
allow_anonymous false
password_file /etc/mosquitto/passwords
acl_file /etc/mosquitto/sitpa-acl
certfile /etc/mosquitto/certs/fullchain.pem
keyfile /etc/mosquitto/certs/privkey.pem
tls_version tlsv1.2
max_packet_size 16384
max_connections 200
''')
if internal_mqtt:
    certdir=pathlib.Path('/etc/mosquitto/certs'); certdir.mkdir(exist_ok=True)
    if not (certdir/'privkey.pem').exists():
        run('openssl','req','-x509','-newkey','rsa:2048','-nodes','-days','30','-subj','/CN=SITPA commissioning',
            '-addext','subjectAltName=IP:127.0.0.1','-keyout',str(certdir/'privkey.pem'),'-out',str(certdir/'fullchain.pem'))
    run('chown','-R','root:mosquitto',str(certdir))
    (certdir/'privkey.pem').chmod(0o640)
    # Commissioning only: no public listener until the trusted certificate exists.
    conf=pathlib.Path('/etc/mosquitto/conf.d/sitpa.conf')
    conf.write_text(conf.read_text().replace('listener 8883','listener 8883 127.0.0.1'))
    run('systemctl','restart','mosquitto')
else:
    run('/etc/letsencrypt/renewal-hooks/deploy/sitpa')
# Local lookup keeps backend traffic on this VM while verifying the public TLS hostname.
hosts=pathlib.Path('/etc/hosts')
if domain not in hosts.read_text():
    with hosts.open('a') as f: f.write(f'\n127.0.0.1 {domain}\n')
write('/etc/sitpa/backend.env',f'''NODE_ENV=production
MQTT_URL=mqtts://{'127.0.0.1' if internal_mqtt else domain}:8883
MQTT_USERNAME=sitpa-backend
MQTT_PASSWORD={accounts['sitpa-backend']}
DATABASE_URL=sqlite:/srv/sitpa/data/sitpa.sqlite
STATION_IDS=tingomaria-01
CORS_ORIGIN=https://{domain},https://jaqzo8.github.io
HOST=127.0.0.1
PORT=8787
{ 'MQTT_CA_FILE=/etc/mosquitto/certs/fullchain.pem' if internal_mqtt else '' }
''',0o600)
write('/etc/systemd/system/sitpa-backend.service','''[Unit]
Description=SITPA telemetry backend
After=network-online.target mosquitto.service
Wants=network-online.target
RequiresMountsFor=/srv/sitpa
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
''')
write('/usr/local/sbin/sitpa-backup','''#!/usr/bin/env python3
import sqlite3,datetime,pathlib,os
os.umask(0o077)
root=pathlib.Path('/srv/sitpa/backups')
path=root/(datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'.sqlite')
with sqlite3.connect('file:/srv/sitpa/data/sitpa.sqlite?mode=ro',uri=True) as src, sqlite3.connect(path) as dst:
    src.backup(dst)
    assert dst.execute('pragma integrity_check').fetchone()[0]=='ok'
for old in sorted(root.glob('*.sqlite'))[:-30]: old.unlink()
''',0o755)
write('/etc/systemd/system/sitpa-backup.service','''[Unit]
Description=Consistent SITPA SQLite backup
RequiresMountsFor=/srv/sitpa
[Service]
Type=oneshot
User=sitpa
ExecStart=/usr/local/sbin/sitpa-backup
''')
write('/etc/systemd/system/sitpa-backup.timer','''[Unit]
Description=Daily SITPA backup (30 copies)
[Timer]
OnCalendar=*-*-* 07:00:00 UTC
Persistent=true
[Install]
WantedBy=timers.target
''')
run('systemctl','daemon-reload')
run('systemctl','enable','--now','sitpa-backend','sitpa-backup.timer','certbot.timer','mosquitto','nginx')
run('systemctl','restart','sitpa-backend')
print('SITPA services configured; credentials remain in /etc/sitpa.')
