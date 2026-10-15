import {readFileSync,writeFileSync,copyFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {X509Certificate,createHash} from 'node:crypto';
import {root,localDirectory,readFirmwareSecrets,protectLocalDirectory,protectLocalFile} from './hardware-config.mjs';

const key=process.argv[2];
if(!key) throw new Error('Indique la ruta de la clave SSH privada');
const host='sitpa-iot-jaqzo8.chilecentral.cloudapp.azure.com';
const wifi=readFirmwareSecrets();
if(!wifi.WIFI_SSID || !wifi.WIFI_PASSWORD) throw new Error('Falta Wi-Fi local');
protectLocalDirectory(localDirectory);
// Capture directly in memory; never print remote passwords or copy the backend account.
const output=execFileSync('ssh',['-i',key,'-o','BatchMode=yes','sitpaadmin@57.156.38.0',
  "sudo awk -F: '$1 == \"tingomaria-01\" {print $2}' /etc/sitpa/mqtt-passwords"],{encoding:'utf8',windowsHide:true}).trim();
if(!/^[a-f0-9]{64}$/.test(output)) throw new Error('Credencial remota inválida');
const response=await fetch('https://letsencrypt.org/certs/isrgrootx1.pem');
if(!response.ok) throw new Error('No se pudo descargar la raíz TLS');
const ca=(await response.text()).trim();
const certificate=new X509Certificate(ca);
if(!certificate.ca || !certificate.subject.includes('ISRG Root X1')) throw new Error('CA inesperada');
const original=resolve(root,'iot_code/secrets.h');
const backup=resolve(localDirectory,'secrets.before-azure.h');
if(!existsSync(backup)) copyFileSync(original,backup);
const content=`#pragma once\n// Privado: Azure, Wi-Fi conservado. No publicar el binario.\n#define WIFI_SSID ${JSON.stringify(wifi.WIFI_SSID)}\n#define WIFI_PASSWORD ${JSON.stringify(wifi.WIFI_PASSWORD)}\n#define MQTT_HOST ${JSON.stringify(host)}\n#define MQTT_PORT 8883\n#define MQTT_USERNAME "tingomaria-01"\n#define MQTT_PASSWORD ${JSON.stringify(output)}\n#define MQTT_USE_TLS 1\n#define MQTT_CA_CERT R"SITPA_CA(${ca}\n)SITPA_CA"\n`;
for(const path of [original,resolve(root,'iot_code/09_Codigo_Final_Proyecto/secrets.h')]) {
  writeFileSync(path,content); protectLocalFile(path);
}
writeFileSync(resolve(localDirectory,'azure.json'),JSON.stringify({host,stationId:'tingomaria-01',secretsSha256:createHash('sha256').update(content).digest('hex')},null,2));
console.log('Configuración Azure guardada; Wi-Fi conservado y credenciales ocultas.');
