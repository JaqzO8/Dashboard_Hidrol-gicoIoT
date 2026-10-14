import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export class TelemetryStore {
  constructor(path = ":memory:") {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS telemetry (
        id INTEGER PRIMARY KEY, station TEXT NOT NULL, boot TEXT NOT NULL, sequence INTEGER NOT NULL,
        time INTEGER NOT NULL, data TEXT NOT NULL, UNIQUE(station,boot,sequence));
      CREATE INDEX IF NOT EXISTS telemetry_time ON telemetry(station,time,id);
      CREATE TABLE IF NOT EXISTS sessions(station TEXT, boot TEXT, sequence INTEGER, retired INTEGER DEFAULT 0, PRIMARY KEY(station,boot));
      CREATE TABLE IF NOT EXISTS aggregates(station TEXT, period INTEGER, time INTEGER, samples INTEGER,
        valid INTEGER, levelSum REAL, levelMin REAL, levelMax REAL, rainSamples INTEGER,
        tempSum REAL, tempCount INTEGER, humSum REAL, humCount INTEGER, speedSum REAL, speedCount INTEGER,
        stateCode INTEGER, PRIMARY KEY(station,period,time));
      CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, time INTEGER, station TEXT, type TEXT, data TEXT);
      CREATE INDEX IF NOT EXISTS events_time ON events(time);`);
    this.insertRaw = this.db.prepare("INSERT INTO telemetry(station,boot,sequence,time,data) VALUES(?,?,?,?,?)");
    this.insertEvent = this.db.prepare("INSERT INTO events(time,station,type,data) VALUES(?,?,?,?)");
  }
  audit(type, station, data = {}, time = Date.now()) {
    this.insertEvent.run(time, station, type, JSON.stringify(data));
  }
  save(row) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const session = this.db.prepare("SELECT * FROM sessions WHERE station=? AND boot=?").get(row.stationId, row.bootId);
      if (session && (session.retired || row.sequence <= session.sequence)) { this.db.exec("ROLLBACK"); return null; }
      if (!session) this.db.prepare("UPDATE sessions SET retired=1 WHERE station=?").run(row.stationId);
      this.db.prepare("INSERT INTO sessions(station,boot,sequence) VALUES(?,?,?) ON CONFLICT(station,boot) DO UPDATE SET sequence=excluded.sequence").run(row.stationId, row.bootId, row.sequence);
      const result = this.insertRaw.run(row.stationId, row.bootId, row.sequence, row.serverTimestamp, JSON.stringify(row));
      row.id = Number(result.lastInsertRowid);
      const valid = row.quality.levelValid && row.sensorAgeMs.level <= 3000 && Number.isFinite(row.levelCm);
      const climateValid = row.quality.climateValid && row.sensorAgeMs.climate <= 10000;
      for (const period of [60000, 300000, 3600000]) {
        this.db.prepare(`INSERT INTO aggregates VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(station,period,time) DO UPDATE SET
          samples=samples+excluded.samples, valid=valid+excluded.valid, levelSum=levelSum+excluded.levelSum,
          levelMin=CASE WHEN excluded.levelMin IS NULL THEN levelMin WHEN levelMin IS NULL THEN excluded.levelMin ELSE MIN(levelMin,excluded.levelMin) END,
          levelMax=CASE WHEN excluded.levelMax IS NULL THEN levelMax WHEN levelMax IS NULL THEN excluded.levelMax ELSE MAX(levelMax,excluded.levelMax) END,
          rainSamples=rainSamples+excluded.rainSamples, tempSum=tempSum+excluded.tempSum, tempCount=tempCount+excluded.tempCount,
          humSum=humSum+excluded.humSum, humCount=humCount+excluded.humCount,
          speedSum=speedSum+excluded.speedSum,speedCount=speedCount+excluded.speedCount,stateCode=MAX(stateCode,excluded.stateCode)`)
          .run(row.stationId, period, Math.floor(row.serverTimestamp / period) * period, 1, Number(valid), valid ? row.levelCm : 0,
            valid ? row.levelCm : null, valid ? row.levelCm : null, Number(row.rainDetected),
            climateValid ? row.temperatureC ?? 0 : 0, Number(climateValid && row.temperatureC !== null),
            climateValid ? row.humidityPct ?? 0 : 0, Number(climateValid && row.humidityPct !== null),
            valid ? row.riseRateCmMin ?? 0 : 0, Number(valid && row.riseRateCmMin !== null), row.stateCode);
      }
      this.audit("telemetry_received", row.stationId, { id: row.id, bootId: row.bootId, sequence: row.sequence }, row.serverTimestamp);
      this.db.exec("COMMIT");
      return row;
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  latest(station) {
    const row = this.db.prepare("SELECT id,data FROM telemetry WHERE station=? ORDER BY time DESC,id DESC LIMIT 1").get(station);
    return row ? { ...JSON.parse(row.data), id: row.id } : null;
  }
  history(station, { from = 0, to = Date.now(), limit = 100, before = Number.MAX_SAFE_INTEGER, resolution = "raw" } = {}) {
    if (resolution === "raw") {
      const rows = this.db.prepare("SELECT id,data FROM telemetry WHERE station=? AND time>=? AND time<=? AND id<? ORDER BY time DESC,id DESC LIMIT ?").all(station, from, to, before, limit);
      return { rows: rows.reverse().map(r => ({ ...JSON.parse(r.data), id: r.id })), nextBefore: rows.length === limit ? rows[0].id : null, resolution };
    }
    const period = { "1m": 60000, "5m": 300000, "1h": 3600000 }[resolution];
    const rows = this.db.prepare("SELECT * FROM aggregates WHERE station=? AND period=? AND time>=? AND time<=? AND time<? ORDER BY time DESC LIMIT ?").all(station, period, from, to, before, limit).reverse();
    return { rows: rows.map(r => ({ stationId: station, serverTimestamp: r.time, samples: r.samples, validSamples: r.valid,
      levelCm: r.valid ? r.levelSum / r.valid : null, levelMinCm: r.levelMin, levelMaxCm: r.levelMax,
      rainDetectedFraction: r.rainSamples / r.samples, temperatureC: r.tempCount ? r.tempSum / r.tempCount : null,
      humidityPct: r.humCount ? r.humSum / r.humCount : null, riseRateCmMin: r.speedCount ? r.speedSum / r.speedCount : null, stateCode: r.stateCode })),
      nextBefore: rows.length === limit ? rows[0].time : null, resolution };
  }
  predictionWindow(station, since) {
    return this.history(station, { from: since, limit: 120, resolution: "1m" }).rows;
  }
  prune(rawDays = 7, now = Date.now()) {
    const day = 86400000;
    this.db.prepare("DELETE FROM telemetry WHERE time<?").run(now - rawDays * day);
    this.db.prepare("DELETE FROM aggregates WHERE time<?").run(now - 365 * day);
    this.db.prepare("DELETE FROM events WHERE time<?").run(now - 30 * day);
  }
  healthy() { return this.db.prepare("SELECT 1 AS ok").get().ok === 1; }
  close() { this.db.close(); }
}
