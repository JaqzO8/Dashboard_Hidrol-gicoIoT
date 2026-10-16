import {readFileSync} from 'node:fs';
import {startHardwareBroker} from './hardware-broker.mjs';
const base='/etc/sitpa';
const instance=await startHardwareBroker({config:JSON.parse(readFileSync(`${base}/broker.json`)),
  ca:readFileSync(`${base}/ca.crt`),cert:readFileSync(`${base}/server.crt`),key:readFileSync(`${base}/server.key`),host:'0.0.0.0',port:8883});
console.log('SITPA MQTT TLS listo en 8883; autenticación y ACL activas.');
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,async()=>{await instance.close();process.exit(0);});
