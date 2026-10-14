import { Aedes } from "aedes";
import { createServer } from "node:tls";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { localDirectory, verifyPassword, stationTopics, backendTopics } from "./hardware-config.mjs";

export async function startHardwareBroker({ config, ca, cert, key, host = config.host, port = config.port }) {
  const broker = await Aedes.createBroker({ connectTimeout: 5000, queueLimit: 32,
    preConnect(client, packet, done) {
      client.sitpaWill = packet.will;
      done(null, true);
    },
    authenticate(client, username, password, done) {
      const account = config.accounts[username];
      let accepted = false;
      const will = client.sitpaWill;
      const willAllowed = !will || (account?.role === "station" && will.topic === stationTopics.at(-1) && will.payload.toString() === "offline");
      try { accepted = willAllowed && verifyPassword(password, account); } catch { /* rechazo uniforme */ }
      if (accepted) client.sitpaRole = account.role;
      done(null, accepted);
    },
    authorizePublish(client, packet, done) {
      // Aedes utiliza client=null para sus avisos internos y Last Will ya autorizado al conectar.
      if (!client) return done(null);
      const allowed = client.sitpaRole === "station" && stationTopics.includes(packet.topic) && packet.payload.length <= 8192;
      done(allowed ? null : new Error("publish_not_authorized"));
    },
    authorizeSubscribe(client, subscription, done) {
      const allowed = client.sitpaRole === "backend" && [...backendTopics, ...stationTopics].includes(subscription.topic);
      done(null, allowed ? subscription : null);
    },
    authorizeForward(client, packet) {
      return client.sitpaRole === "backend" && stationTopics.includes(packet.topic) ? packet : null;
    },
  });
  broker.on("clientError", () => {}); broker.on("connectionError", () => {});
  const server = createServer({ ca, cert, key, minVersion: "TLSv1.2", handshakeTimeout: 5000 }, broker.handle);
  server.on("tlsClientError", () => {});
  await new Promise((resolveReady, reject) => { server.once("error", reject); server.listen(port, host, resolveReady); });
  return { broker, server, port: server.address().port,
    async close() { await new Promise(done => broker.close(done)); await new Promise(done => server.close(done)); } };
}
export function hardwareBrokerOptions(directory = localDirectory) {
  return { config: JSON.parse(readFileSync(resolve(directory, "broker.json"), "utf8")),
    ca: readFileSync(resolve(directory, "ca.crt")), cert: readFileSync(resolve(directory, "server.crt")), key: readFileSync(resolve(directory, "server.key")) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = hardwareBrokerOptions();
  const instance = await startHardwareBroker(options);
  console.log(`SITPA broker de banco TLS: ${options.config.host}:${instance.port}. Solo cuentas y tópicos autorizados.`);
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => { await instance.close(); process.exit(0); });
}
