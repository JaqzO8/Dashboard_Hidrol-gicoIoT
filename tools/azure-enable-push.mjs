// Run as root on the VM after installing backend dependencies.
import {createRequire} from 'node:module';
import {existsSync,writeFileSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const require=createRequire('/opt/sitpa/backend/package.json');
const webpush=require('web-push');
const path='/etc/sitpa/push.env';
if(!existsSync(path)) {
  const keys=webpush.generateVAPIDKeys();
  writeFileSync(path,`VAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\nVAPID_SUBJECT=https://sitpa-iot-jaqzo8.chilecentral.cloudapp.azure.com\n`,{mode:0o600});
}
const unit='/etc/systemd/system/sitpa-backend.service';
let text=readFileSync(unit,'utf8');
if(!text.includes('EnvironmentFile=-/etc/sitpa/push.env')) writeFileSync(unit,text.replace('EnvironmentFile=/etc/sitpa/backend.env','EnvironmentFile=/etc/sitpa/backend.env\nEnvironmentFile=-/etc/sitpa/push.env'));
execFileSync('systemctl',['daemon-reload']);
execFileSync('systemctl',['restart','sitpa-backend']);
console.log('Web Push habilitado. Clave privada conservada solo en la VM.');
