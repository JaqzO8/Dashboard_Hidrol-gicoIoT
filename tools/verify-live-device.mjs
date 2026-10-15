import WebSocket from 'ws';
import { writeFileSync, mkdirSync } from 'node:fs';
const base='https://sitpa-iot-jaqzo8.chilecentral.cloudapp.azure.com';
const rows=[];
const ws=new WebSocket(base.replace('https:','wss:')+'/ws?stationId=tingomaria-01',{origin:base});
const start=Date.now();
ws.on('message',data=>{const msg=JSON.parse(data);if(msg.type==='telemetry') rows.push({...msg.reading,receivedAt:Date.now()});});
ws.on('error',error=>console.error(error.message));
setTimeout(()=>{
  ws.close();
  const valid=rows.filter(r=>r.quality.levelValid && r.sensorAgeMs.level<=3000);
  const report={checkedAt:new Date().toISOString(),durationSeconds:(Date.now()-start)/1000,count:rows.length,
    hz:rows.length>1?(rows.length-1)/((rows.at(-1).receivedAt-rows[0].receivedAt)/1000):0,
    validLevelCount:valid.length,validClimateCount:rows.filter(r=>r.quality.climateValid).length,
    simulationCount:rows.filter(r=>r.simulation).length,
    minCm:valid.length?Math.min(...valid.map(r=>r.levelCm)):null,maxCm:valid.length?Math.max(...valid.map(r=>r.levelCm)):null,
    states:[...new Set(rows.map(r=>r.state))],latest:rows.at(-1)??null};
  mkdirSync('qa-artifacts',{recursive:true});writeFileSync('qa-artifacts/esp32-live-report.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  if(!rows.length) process.exitCode=1;
},62000);
