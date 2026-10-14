import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { X509Certificate, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("..", import.meta.url));
export const localDirectory = resolve(root, ".local-mqtt");
export const stationId = "tingomaria-01";
export const kinds = ["telemetry", "state", "alert", "status"];
export const stationTopics = kinds.map(kind => `sitpa/v1/stations/${stationId}/${kind}`);
export const backendTopics = kinds.map(kind => `sitpa/v1/stations/+/${kind}`);

export function readFirmwareSecrets(path = resolve(root, "iot_code/secrets.h")) {
  const source = readFileSync(path, "utf8"), fields = {};
  for (const match of source.matchAll(/^#define\s+(\w+)\s+("(?:[^"\\]|\\.)*")\s*$/gm)) {
    fields[match[1]] = JSON.parse(match[2]);
  }
  return fields;
}
export const secretHash = (password, salt) => scryptSync(password, salt, 32).toString("hex");
export function verifyPassword(password, account) {
  if (!account || !password || password.length > 256) return false;
  const expected = Buffer.from(account.hash, "hex"), actual = Buffer.from(secretHash(password, account.salt), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export function newAccount(role) {
  const password = randomBytes(32).toString("base64url"), salt = randomBytes(16).toString("hex");
  return { password, account: { role, salt, hash: secretHash(password, salt) } };
}
export function findOpenSSL() {
  const candidates = [process.env.SITPA_OPENSSL, "C:/Program Files/Git/mingw64/bin/openssl.exe", "C:/Program Files/Git/usr/bin/openssl.exe", "openssl"].filter(Boolean);
  for (const candidate of candidates) {
    try { execFileSync(candidate, ["version"], { stdio: "pipe", windowsHide: true, timeout: 10000 }); return candidate; } catch { /* siguiente instalación */ }
  }
  throw new Error("OpenSSL no disponible; configure SITPA_OPENSSL con la ruta de una instalación oficial");
}
export function protectLocalDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") return;
  const script = "$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; & icacls $env:SITPA_PRIVATE_DIR /inheritance:r /grant:r ('*'+$sid+':(OI)(CI)F') '*S-1-5-18:(OI)(CI)F' | Out-Null; if ($LASTEXITCODE -ne 0) { exit 1 }";
  execFileSync("pwsh", ["-NoProfile", "-Command", script], { env: { ...process.env, SITPA_PRIVATE_DIR: directory }, stdio: "pipe", windowsHide: true, timeout: 15000 });
}
export function protectLocalFile(path) {
  if (process.platform !== "win32") return;
  const script = "$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; & icacls $env:SITPA_PRIVATE_FILE /inheritance:r /grant:r ('*'+$sid+':F') '*S-1-5-18:F' | Out-Null; if ($LASTEXITCODE -ne 0) { exit 1 }";
  execFileSync("pwsh", ["-NoProfile", "-Command", script], { env: { ...process.env, SITPA_PRIVATE_FILE: path }, stdio: "pipe", windowsHide: true, timeout: 15000 });
}
export function prepareCertificates(directory, host) {
  if (isIP(host) !== 4) throw new Error("Indique una IPv4 LAN válida mediante --host");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const openssl = findOpenSSL();
  const run = args => {
    try { execFileSync(openssl, args, { cwd: directory, stdio: "pipe", windowsHide: true, timeout: 30000 }); }
    catch { throw new Error("No se pudieron generar los certificados locales con OpenSSL"); }
  };
  const caFile = resolve(directory, "ca.crt"), caKey = resolve(directory, "ca.key");
  if (existsSync(caFile) !== existsSync(caKey)) throw new Error("CA local incompleta; recuperar la pareja original antes de continuar");
  if (!existsSync(caFile)) run(["req", "-x509", "-newkey", "rsa:3072", "-nodes", "-sha256", "-days", "1825", "-subj", "/CN=SITPA Local CA", "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign,cRLSign", "-keyout", "ca.key", "-out", "ca.crt"]);
  const ca = new X509Certificate(readFileSync(caFile));
  if (Date.parse(ca.validTo) < Date.now() + 31 * 86400000) throw new Error("CA próxima a caducar; requiere renovación y actualización del ESP32");
  const certFile = resolve(directory, "server.crt"), keyFile = resolve(directory, "server.key");
  let renew = true;
  if (existsSync(certFile) && existsSync(keyFile)) {
    const cert = new X509Certificate(readFileSync(certFile));
    renew = !cert.checkIP(host) || !cert.verify(ca.publicKey) || Date.parse(cert.validTo) < Date.now() + 30 * 86400000;
  }
  if (renew) {
    writeFileSync(resolve(directory, "server.ext"), `basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=IP:${host},IP:127.0.0.1,DNS:localhost\n`);
    run(["req", "-new", "-newkey", "rsa:2048", "-nodes", "-sha256", "-subj", "/CN=SITPA Local MQTT", "-keyout", "server.key", "-out", "server.csr"]);
    run(["x509", "-req", "-in", "server.csr", "-CA", "ca.crt", "-CAkey", "ca.key", "-set_serial", `0x${randomBytes(16).toString("hex")}`, "-days", "365", "-sha256", "-extfile", "server.ext", "-out", "server.crt"]);
  }
  return { ca: readFileSync(caFile), cert: readFileSync(certFile), key: readFileSync(keyFile) };
}
