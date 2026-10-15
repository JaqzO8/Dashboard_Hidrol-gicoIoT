import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {PushAlerts,validSubscription,pushEligible} from '../backend/src/push.js';
import {reading} from './fixtures.mjs';
const sub={endpoint:'https://fcm.googleapis.com/fcm/send/example',keys:{p256dh:'B'.repeat(87),auth:'A'.repeat(22)}};
test('push rechaza destinos privados, dominios falsos y claves inválidas',()=>{
  assert(validSubscription(sub));
  for(const endpoint of ['https://127.0.0.1/a','https://fcm.googleapis.com.evil.test/a','http://fcm.googleapis.com/a','https://fcm.googleapis.com:8443/a','https://user:pass@fcm.googleapis.com/a']) assert(!validSubscription({...sub,endpoint}));
  assert(!validSubscription({...sub,keys:{auth:'short'}}));
});
test('suscripciones requieren token para modificar o eliminar y persisten en SQLite',()=>{
  const db=new DatabaseSync(':memory:'), p=new PushAlerts(db,{});
  const token=p.subscribe('tingomaria-01',sub);
  assert.throws(()=>p.subscribe('other',sub));
  p.remove(sub.endpoint,'wrong'); assert.equal(db.prepare('SELECT count(*) n FROM push_subscriptions').get().n,1);
  p.remove(sub.endpoint,token); assert.equal(db.prepare('SELECT count(*) n FROM push_subscriptions').get().n,0);
  db.close();
});
test('la prueba solo se envía al dispositivo autenticado y limita repeticiones',async()=>{
  const db=new DatabaseSync(':memory:');let calls=0;
  const p=new PushAlerts(db,{},async()=>{calls++;});
  const token=p.subscribe('tingomaria-01',sub);
  await assert.rejects(p.test(sub.endpoint,'invalid'));
  await p.test(sub.endpoint,token); assert.equal(calls,1);
  await assert.rejects(p.test(sub.endpoint,token));assert.equal(calls,1);
  db.close();
});
test('avisos excluyen simulación, datos antiguos y sensores inválidos; deduplican y limpian suscripciones caducadas',async()=>{
  const r=reading({stateCode:2,state:'ALTO',deviceTimestamp:Date.now()});
  for(const bad of [{simulation:true},{deviceTimestamp:0},{deviceTimestamp:Date.now()-10000},{quality:{levelValid:false}},{sensorAgeMs:{level:5000}}]) assert(!pushEligible({...r,...bad}));
  const db=new DatabaseSync(':memory:'); let sends=0;
  const p=new PushAlerts(db,{VAPID_PUBLIC_KEY:'pub',VAPID_PRIVATE_KEY:'private',VAPID_SUBJECT:'https://example.org'},async()=>{sends++;throw {statusCode:410};});
  p.subscribe('tingomaria-01',sub); p.notify(r); await p.close();
  assert.equal(sends,1); assert.equal(db.prepare('SELECT count(*) n FROM push_subscriptions').get().n,0);
  p.subscribe('tingomaria-01',sub); p.notify(r); await p.close(); assert.equal(sends,1);
  p.notify({...r,stateCode:3}); await p.close(); assert.equal(sends,2);
  db.close();
});
