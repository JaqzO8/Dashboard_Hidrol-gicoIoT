import webpush from 'web-push';
import {createHash, randomBytes} from 'node:crypto';

const hash = s => createHash('sha256').update(s).digest('hex');
export function validSubscription(s) {
  try {
    const u = new URL(s.endpoint);
    const allowed = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'];
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && !u.hash && s.endpoint.length < 2048 &&
      allowed.some(h => u.hostname === h || u.hostname.endsWith('.'+h)) &&
      /^[A-Za-z0-9_-]{87}=?$/.test(s.keys?.p256dh) && /^[A-Za-z0-9_-]{22}={0,2}$/.test(s.keys?.auth);
  } catch { return false; }
}
export function pushEligible(r, now=Date.now()) {
  return !r.simulation && r.quality?.levelValid === true && Number.isFinite(r.sensorAgeMs?.level) &&
    r.sensorAgeMs.level <= 3000 && Number.isFinite(r.levelCm) && r.deviceTimestamp > 0 &&
    now-r.deviceTimestamp >= -1000 && now-r.deviceTimestamp <= 3000;
}
export class PushAlerts {
  constructor(db, env=process.env, send=webpush.sendNotification.bind(webpush)) {
    this.db=db; this.send=send; this.pending=new Set();
    this.publicKey=env.VAPID_PUBLIC_KEY || ''; this.privateKey=env.VAPID_PRIVATE_KEY || '';
    this.enabled=Boolean(this.publicKey && this.privateKey && env.VAPID_SUBJECT);
    this.subject=env.VAPID_SUBJECT;
    db.exec(`CREATE TABLE IF NOT EXISTS push_subscriptions(endpoint TEXT PRIMARY KEY, station TEXT NOT NULL, subscription TEXT NOT NULL, token TEXT NOT NULL, updated INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS push_states(station TEXT PRIMARY KEY, level INTEGER NOT NULL, sent INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS push_tests(endpoint TEXT PRIMARY KEY, sent INTEGER NOT NULL);`);
  }
  subscribe(station,subscription,token) {
    if(!validSubscription(subscription)) throw new Error('invalid_subscription');
    const key=hash(subscription.endpoint), old=this.db.prepare('SELECT token FROM push_subscriptions WHERE endpoint=?').get(key);
    if(old && (!token || old.token!==hash(token))) throw new Error('invalid_token');
    if(!old && this.db.prepare('SELECT count(*) AS n FROM push_subscriptions').get().n>=1000) throw new Error('capacity');
    const secret=old?token:randomBytes(32).toString('hex');
    this.db.prepare('INSERT OR REPLACE INTO push_subscriptions VALUES(?,?,?,?,?)').run(key,station,JSON.stringify(subscription),hash(secret),Date.now());
    return secret;
  }
  remove(endpoint,token) {
    if(typeof endpoint!=='string'||typeof token!=='string') throw new Error('invalid_request');
    this.db.prepare('DELETE FROM push_subscriptions WHERE endpoint=? AND token=?').run(hash(endpoint),hash(token));
  }
  async test(endpoint,token) {
    if(typeof endpoint!=='string'||typeof token!=='string') throw new Error('invalid_request');
    const key=hash(endpoint);
    const row=this.db.prepare('SELECT subscription FROM push_subscriptions WHERE endpoint=? AND token=?').get(key,hash(token));
    if(!row) throw new Error('invalid_token');
    const last=this.db.prepare('SELECT sent FROM push_tests WHERE endpoint=?').get(key);
    if(last && Date.now()-last.sent<60000) throw new Error('wait_one_minute');
    this.db.prepare('INSERT OR REPLACE INTO push_tests VALUES(?,?)').run(key,Date.now());
    await this.send(JSON.parse(row.subscription),JSON.stringify({title:'SITPA · Prueba de aviso',body:'Este aviso llegó desde SITPA. Es solo una prueba; no indica una emergencia.',tag:'sitpa-test',at:Date.now()}),
      {TTL:60,urgency:'high',timeout:10000,vapidDetails:{subject:this.subject,publicKey:this.publicKey,privateKey:this.privateKey}});
  }
  notify(r) {
    if(!this.enabled || !pushEligible(r)) return;
    const old=this.db.prepare('SELECT level,sent FROM push_states WHERE station=?').get(r.stationId);
    if(r.stateCode<2) { this.db.prepare('INSERT OR REPLACE INTO push_states VALUES(?,?,?)').run(r.stationId,r.stateCode,old?.sent||0); return; }
    if(old?.level===r.stateCode || (old && r.stateCode<=old.level) || (old && Date.now()-old.sent<60000 && r.stateCode!==3)) return;
    this.db.prepare('INSERT OR REPLACE INTO push_states VALUES(?,?,?)').run(r.stationId,r.stateCode,Date.now());
    const payload=JSON.stringify({title:r.stateCode===3?'SITPA · Nivel muy alto':'SITPA · El nivel ha subido',
      body:'Estación de prueba Huallaga: se alcanzó un umbral de aviso. Consulta la información actual y las indicaciones de las autoridades.',
      tag:'sitpa-'+r.stationId, at:Date.now()});
    const rows=this.db.prepare('SELECT endpoint,subscription FROM push_subscriptions WHERE station=?').all(r.stationId);
    const job=(async()=>{
      // Bounded batches; providers receive only subscriptions explicitly registered by visitors.
      for(let i=0;i<rows.length;i+=10) await Promise.all(rows.slice(i,i+10).map(async row=>{
        try { await this.send(JSON.parse(row.subscription),payload,{TTL:60,urgency:'high',timeout:10000,
          vapidDetails:{subject:this.subject,publicKey:this.publicKey,privateKey:this.privateKey}}); }
        catch(e) { if([404,410].includes(e.statusCode)) this.db.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').run(row.endpoint); }
      }));
    })();
    this.pending.add(job); job.catch(()=>console.error('SITPA: push_delivery_failure')).finally(()=>this.pending.delete(job));
  }
  async close() { await Promise.allSettled([...this.pending]); }
}
