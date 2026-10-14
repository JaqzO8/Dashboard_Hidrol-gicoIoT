import { Aedes } from "aedes";
import { createServer } from "node:net";
import { pathToFileURL } from "node:url";
export async function startLocalBroker(port = 1883) {
  const broker = await Aedes.createBroker();
  broker.on("clientError", () => {});
  broker.on("connectionError", () => {});
  const server = createServer(broker.handle);
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  return { broker, server, port: server.address().port,
    async close() { await new Promise(resolve => broker.close(resolve)); await new Promise(resolve => server.close(resolve)); } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const instance = await startLocalBroker(Number(process.env.MQTT_PORT || 1883));
  console.log(`Broker Aedes SOLO PRUEBAS: mqtt://127.0.0.1:${instance.port}`);
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => { await instance.close(); process.exit(0); });
}
