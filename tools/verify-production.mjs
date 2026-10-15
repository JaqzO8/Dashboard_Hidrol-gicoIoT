import assert from 'node:assert/strict';
import WebSocket from 'ws';

const base = process.argv[2];
assert(base?.startsWith('https://'), 'Pass the deployed HTTPS origin');
for (const page of ['/', '/tendencias.html', '/ambiente.html', '/red-nacional.html', '/registros.html', '/sitpa-logo.jpg']) {
  const response = await fetch(base + page);
  assert.equal(response.status, 200, page);
  console.log('OK', page);
}
const config = await (await fetch(base + '/sitpa-config.json')).json();
assert.equal(config.apiBaseUrl, base);
const health = await (await fetch(base + '/healthz')).json();
assert.equal(health.database, true); assert.equal(health.mqtt, true);
console.log('OK SQLite and MQTT');
for (const kind of ['latest', 'history', 'status', 'forecast']) {
  const res = await fetch(`${base}/api/v1/stations/tingomaria-01/${kind}`);
  assert.equal(res.status, 200, kind);
  console.log('OK API', kind);
}
assert.equal((await fetch(base+'/healthz', {headers:{Origin:'https://untrusted.invalid'}})).status,403);
await new Promise((resolve,reject)=>{
  const ws = new WebSocket(base.replace('https:', 'wss:')+'/ws?stationId=tingomaria-01', {origin:base});
  const timeout=setTimeout(()=>{ws.terminate();reject(new Error('WebSocket timeout'));},10000);
  ws.on('error',reject);
  ws.once('message',data=>{
    try { assert.equal(JSON.parse(data).type,'snapshot'); clearTimeout(timeout); ws.close(); resolve(); }
    catch(e){clearTimeout(timeout);ws.terminate();reject(e);}
  });
});
console.log('OK WSS and CORS restrictions');
