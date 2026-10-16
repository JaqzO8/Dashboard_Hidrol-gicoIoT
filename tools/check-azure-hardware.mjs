import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash,X509Certificate} from 'node:crypto';
import assert from 'node:assert/strict';
import {root,localDirectory,readFirmwareSecrets} from './hardware-config.mjs';

export function checkAzureHardware(configurationOnly=false, provider='azure') {
  const path=resolve(root,'iot_code/secrets.h'), source=readFileSync(path,'utf8');
  const config=JSON.parse(readFileSync(resolve(localDirectory,`${provider}.json`),'utf8'));
  const secrets=readFirmwareSecrets();
  const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
  assert.equal(sha(path),config.secretsSha256,'Configuración modificada después de preparar '+provider);
  assert.equal(secrets.MQTT_HOST,config.host);
  assert.equal(secrets.MQTT_USERNAME,config.stationId);
  assert(secrets.WIFI_SSID && secrets.WIFI_PASSWORD.length>=8);
  assert.match(source,/^#define MQTT_USE_TLS 1$/m);
  assert.match(source,/^#define MQTT_PORT 8883$/m);
  const ca=new X509Certificate(source.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/)[0]);
  assert(ca.ca && Date.parse(ca.validTo)>Date.now()+86400000);
  assert.equal(source,readFileSync(resolve(root,'iot_code/09_Codigo_Final_Proyecto/secrets.h'),'utf8'));
  if(!configurationOnly) {
    const output=resolve(root,'.tools/firmware-ready');
    const manifest=JSON.parse(readFileSync(resolve(output,'sitpa-build.json'),'utf8').replace(/^\uFEFF/,''));
    assert(manifest.configured && ['esp32:esp32:esp32','esp32:esp32:esp32:FlashMode=dio,FlashFreq=40'].includes(manifest.fqbn));
    assert.equal(manifest.secretsSha256.toLowerCase(),sha(path));
    assert.equal(manifest.sourceSha256.toLowerCase(),sha(resolve(root,'iot_code/09_Codigo_Final_Proyecto/09_Codigo_Final_Proyecto.ino')));
    assert.equal(manifest.logicSha256.toLowerCase(),sha(resolve(root,'iot_code/edge_logic.h')));
    assert(existsSync(resolve(output,'09_Codigo_Final_Proyecto.ino.bin')));
  }
  console.log('OK · Configuración '+provider+', CA, Wi-Fi y archivos sincronizados'+(configurationOnly?'':'; firmware compilado vigente'));
  console.log('Pendiente: conectar placa, confirmar COM y verificar sensores físicamente.');
}
