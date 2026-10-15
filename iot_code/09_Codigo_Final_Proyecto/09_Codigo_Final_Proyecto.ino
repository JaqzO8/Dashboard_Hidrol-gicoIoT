/* SITPA — ESP32. La alarma local NO depende de la red.
 * Hardware original: DHT11, FC-37 AO, ultrasónico, SSD1306, relé activo HIGH.
 */
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <DHT.h>
#include <time.h>
#include "edge_logic.h"
#if __has_include("secrets.h")
#include "secrets.h"
#else
#include "secrets.example.h"
#endif

constexpr char STATION_ID[] = "tingomaria-01";
constexpr int PIN_DHT = 16, PIN_FC37_AO = 36, PIN_TRIG = 18, PIN_ECHO = 19;
constexpr int LED_VERDE = 25, LED_AMARILLO = 26, LED_ROJO = 27, PIN_BUZZER = 23;
// Conservar polaridad EFECTIVA original, no la constante LOW contradictoria.
constexpr int BUZZER_ON = HIGH, BUZZER_OFF = LOW;
constexpr uint32_t NIVEL_MS = 60, LLUVIA_MS = 500, DHT_MS = 2000;
constexpr uint32_t TENDENCIA_MS = 2000, SNAPSHOT_MS = 1000, OLED_MS = 500;
DHT dht(PIN_DHT, DHT11);
Adafruit_SSD1306 display(128, 64, &Wire, -1);
bool oledReady = false;
struct Snapshot {
  float level = NAN, distance = NAN, temperature = NAN, humidity = NAN;
  float rate = NAN, prediction = NAN;
  int rainRaw = -1;
  bool levelValid = false, climateValid = false;
  uint32_t levelAt = 0, climateAt = 0, rainAt = 0, uptime = 0, sequence = 0;
  EstadoRiesgo state = NORMAL;
};
Snapshot reading;
QueueHandle_t outgoing;
char bootId[17];
float samples[5];
uint8_t sampleCount = 0, sampleIndex = 0;
TendenciaNivel trend;
uint32_t trendAt = 0;

void actualizarAlarma(uint32_t now) {
  const bool fault = !reading.levelValid || now - reading.levelAt > 3000;
  digitalWrite(LED_VERDE, !fault && reading.state == NORMAL);
  digitalWrite(LED_AMARILLO, !fault && reading.state == MEDIO);
  digitalWrite(LED_ROJO, reading.state >= ALTO || (fault && now % 1000 < 500));
  const bool anticipated = !fault && isfinite(reading.prediction) && reading.rate >= 0.3f &&
    ((reading.level < NIVEL_MEDIO_CM && reading.prediction >= NIVEL_MEDIO_CM) ||
     (reading.level < NIVEL_ALTO_CM && reading.prediction >= NIVEL_ALTO_CM) ||
     (reading.level < NIVEL_CRITICO_CM && reading.prediction >= NIVEL_CRITICO_CM));
  const bool sound = reading.state == CRITICO || (reading.state == ALTO && now % 1000 < 600) || (reading.state == MEDIO && now % 4000 < 150) || (anticipated && now % 3000 < 120) || (fault && now % 2000 < 200);
  digitalWrite(PIN_BUZZER, sound ? BUZZER_ON : BUZZER_OFF);
}
void leerNivel(uint32_t now) {
  digitalWrite(PIN_TRIG, LOW); delayMicroseconds(3);
  digitalWrite(PIN_TRIG, HIGH); delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);
  const unsigned long duration = pulseIn(PIN_ECHO, HIGH, 30000); // Espera acotada.
  const float distance = duration * 0.0343f / 2.0f;
  if (!duration || distance < 2 || distance > DISTANCIA_SENSOR_FONDO_CM + 1.0f) {
    reading.levelValid = false; sampleCount = sampleIndex = 0; trend.reset();
    reading.rate = reading.prediction = NAN;
    return; // Retener último nivel/estado; no fingir una lectura nueva.
  }
  samples[sampleIndex] = distance; sampleIndex = (sampleIndex + 1) % 5;
  if (sampleCount < 5) ++sampleCount;
  float ordered[5];
  for (uint8_t i = 0; i < sampleCount; ++i) ordered[i] = samples[i];
  for (uint8_t i = 0; i < sampleCount; ++i) for (uint8_t j=i+1;j<sampleCount;++j)
    if (ordered[j]<ordered[i]) { float tmp=ordered[i]; ordered[i]=ordered[j]; ordered[j]=tmp; }
  reading.distance = ordered[sampleCount/2]; reading.level = calcularNivel(reading.distance);
  reading.levelAt = now; reading.levelValid = true;
  if (now - trendAt >= TENDENCIA_MS) { trendAt = now; reading.rate = trend.update(reading.level, now); }
  reading.prediction = isfinite(reading.rate) ? fmaxf(0, reading.level + reading.rate * MINUTOS_PREDICCION) : NAN;
  EstadoRiesgo next = evaluarEstado(reading.level, reading.rate, reading.prediction);
  const float exitThreshold = reading.state == CRITICO ? NIVEL_CRITICO_CM : reading.state == ALTO ? NIVEL_ALTO_CM : NIVEL_MEDIO_CM;
  if (next >= reading.state || reading.level < exitThreshold - 0.3f) reading.state = next;
}
void mostrarOLED() {
  if (!oledReady) return;
  display.clearDisplay(); display.setTextColor(SSD1306_WHITE); display.setTextSize(1);
  display.setCursor(0, 0); display.println("SITPA / EDGE +3 min");
  display.print("Nivel: "); display.print(reading.level, 1); display.println(" cm");
  display.print("Edge: "); display.print(reading.prediction, 1); display.println(" cm");
  display.print("Vel: "); display.print(reading.rate, 1); display.println(" cm/min");
  display.print("Lluvia: "); display.println(reading.rainRaw < 3000 ? "SI" : "NO");
  display.println(reading.levelValid ? textoEstado(reading.state) : "FALLO SENSOR NIVEL");
  display.display();
}
void campoFloat(JsonDocument& doc, const char* key, float value) {
  if (isfinite(value)) doc[key] = value; else doc[key] = nullptr;
}
void redTask(void*) {
  WiFiClient plain;
  WiFiClientSecure secure;
  PubSubClient mqtt;
#if MQTT_USE_TLS
  secure.setCACert(MQTT_CA_CERT); secure.setHandshakeTimeout(5); mqtt.setClient(secure);
#else
  mqtt.setClient(plain); // Solo banco de pruebas en una red aislada.
#endif
  mqtt.setServer(MQTT_HOST, MQTT_PORT); mqtt.setBufferSize(2048);
  mqtt.setKeepAlive(15); mqtt.setSocketTimeout(2);
  WiFi.persistent(false);
  WiFi.mode(WIFI_STA); WiFi.setAutoReconnect(false);
  WiFi.onEvent([](WiFiEvent_t event, WiFiEventInfo_t info) {
    if (event == ARDUINO_EVENT_WIFI_STA_DISCONNECTED) Serial.printf("WiFi motivo desconexion=%u\n",info.wifi_sta_disconnected.reason);
  });
  String prefix = String("sitpa/v1/stations/") + STATION_ID;
  String statusTopic = prefix + "/status";
  String clientId = String("sitpa-") + STATION_ID + "-" + bootId;
  uint32_t wifiAttempt = 0, wifiScanAt = 0, mqttAttempt = 0, statusAt = 0;
  int sentState = -1, previousWifiStatus = -1;
  bool previousMqttStatus = false, waitingForClock = false;
  bool ntpStarted = false;
  for (;;) {
    const uint32_t now = millis();
    const int wifiStatus = WiFi.status();
    if (wifiStatus != previousWifiStatus) {
      previousWifiStatus = wifiStatus;
      if (wifiStatus == WL_CONNECTED) Serial.println("WiFi conectado; comprobando hora y MQTT TLS.");
      else Serial.printf("WiFi no conectado (estado %d); alarma local continua.\n",wifiStatus);
    }
    if (strlen(WIFI_SSID) && WiFi.status() != WL_CONNECTED && (!wifiAttempt || now - wifiAttempt >= 30000)) {
      // Un único responsable de reconexión: no solapar begin con el intento anterior.
      WiFi.disconnect(false, false, 200);
      vTaskDelay(pdMS_TO_TICKS(100));
      if (!wifiScanAt || now - wifiScanAt >= 120000) {
        wifiScanAt = now;
        const int count = WiFi.scanNetworks(false, true);
        bool found = false;
        for (int i = 0; i < count; ++i) {
          if (WiFi.SSID(i) == WIFI_SSID) {
            found = true;
            Serial.printf("WiFi red guardada visible: canal=%ld RSSI=%ld dBm seguridad=%d\n",
              (long)WiFi.channel(i), (long)WiFi.RSSI(i), (int)WiFi.encryptionType(i));
          }
        }
        if (!found) Serial.printf("WiFi red guardada no visible; redes detectadas=%d. Revisar nombre, alcance y banda 2.4 GHz.\n", count);
        WiFi.scanDelete(); // No imprimir nombres ni identificadores de redes vecinas.
      }
      wifiAttempt = millis(); WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    }
    if (WiFi.status() == WL_CONNECTED && !ntpStarted) {
      configTime(0, 0, "pool.ntp.org", "time.nist.gov"); ntpStarted = true;
    }
    bool configured = strlen(MQTT_HOST) > 0;
#if MQTT_USE_TLS
    configured = configured && strlen(MQTT_CA_CERT) > 0 && time(nullptr) > 1577836800;
    const bool needsClock = WiFi.status() == WL_CONNECTED && time(nullptr) <= 1577836800;
    if (needsClock && !waitingForClock) Serial.println("Esperando hora NTP para validar certificado TLS.");
    waitingForClock = needsClock;
#endif
    if (configured && WiFi.status() == WL_CONNECTED && !mqtt.connected() && (!mqttAttempt || now - mqttAttempt >= 5000)) {
      mqttAttempt = now;
      if (mqtt.connect(clientId.c_str(), MQTT_USERNAME, MQTT_PASSWORD, statusTopic.c_str(), 1, true, "offline")) {
        mqtt.publish(statusTopic.c_str(), "online", true); statusAt = now; sentState = -1;
      } else Serial.printf("MQTT no conectado (codigo %d); reintento en 5 s.\n", mqtt.state());
    }
    if (mqtt.connected() != previousMqttStatus) {
      previousMqttStatus = mqtt.connected();
      Serial.println(previousMqttStatus ? "MQTT conectado; telemetria cada 1000 ms." : "MQTT desconectado; alarma local continua.");
    }
    if (mqtt.connected()) {
      mqtt.loop();
      if (now - statusAt >= 10000) { statusAt = now; mqtt.publish(statusTopic.c_str(), "online", true); }
      Snapshot snapshot;
      if (xQueueReceive(outgoing, &snapshot, 0) == pdTRUE && millis() - snapshot.uptime < 1500) {
        JsonDocument doc;
        doc["schemaVersion"] = 1; doc["stationId"] = STATION_ID;
        doc["bootId"] = bootId; doc["sequence"] = snapshot.sequence;
        const time_t epoch = time(nullptr);
        doc["deviceTimestamp"] = epoch > 1577836800 ? uint64_t(epoch) * 1000 : 0;
        doc["uptimeMs"] = snapshot.uptime;
        campoFloat(doc, "levelCm", snapshot.level); campoFloat(doc, "distanceCm", snapshot.distance);
        campoFloat(doc, "temperatureC", snapshot.temperature); campoFloat(doc, "humidityPct", snapshot.humidity);
        campoFloat(doc, "riseRateCmMin", snapshot.rate); campoFloat(doc, "edgePredictionCm", snapshot.prediction);
        doc["edgePredictionMinutes"] = 3;
        doc["rainRaw"] = snapshot.rainRaw; doc["rainDetected"] = snapshot.rainRaw >= 0 && snapshot.rainRaw < 3000;
        doc["stateCode"] = int(snapshot.state); doc["state"] = textoEstado(snapshot.state); doc["rssi"] = WiFi.RSSI();
        doc["quality"]["levelValid"] = snapshot.levelValid; doc["quality"]["climateValid"] = snapshot.climateValid;
        doc["sensorAgeMs"]["level"] = isfinite(snapshot.level) ? snapshot.uptime - snapshot.levelAt : UINT32_MAX;
        doc["sensorAgeMs"]["climate"] = isfinite(snapshot.temperature) ? snapshot.uptime - snapshot.climateAt : UINT32_MAX;
        doc["sensorAgeMs"]["rain"] = snapshot.uptime - snapshot.rainAt;
        char payload[1800]; serializeJson(doc, payload, sizeof(payload));
        mqtt.publish((prefix + "/telemetry").c_str(), payload, false);
        if (sentState != int(snapshot.state)) {
          if (mqtt.publish((prefix + "/state").c_str(), payload, true)) {
            sentState = int(snapshot.state);
            if (snapshot.state >= MEDIO) mqtt.publish((prefix + "/alert").c_str(), payload, false);
          }
        }
      }
    }
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}
void setup() {
  Serial.begin(115200);
  pinMode(PIN_FC37_AO, INPUT); pinMode(PIN_TRIG, OUTPUT); pinMode(PIN_ECHO, INPUT);
  pinMode(LED_VERDE, OUTPUT); pinMode(LED_AMARILLO, OUTPUT); pinMode(LED_ROJO, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT); digitalWrite(PIN_BUZZER, BUZZER_OFF);
  dht.begin(); Wire.begin(21, 22); Wire.setTimeOut(30);
  oledReady = display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  snprintf(bootId, sizeof(bootId), "%08lx%08lx", (unsigned long)esp_random(), (unsigned long)esp_random());
  outgoing = xQueueCreate(1, sizeof(Snapshot));
  if (!outgoing || xTaskCreatePinnedToCore(redTask, "sitpa-network", 12288, nullptr, 1, nullptr, 0) != pdPASS)
    Serial.println("Red no disponible; alarma local activa.");
  if (!oledReady) Serial.println("OLED no detectada; sensores y alarma continuan.");
  Serial.println("SITPA: alarma local iniciada; snapshot 1000 ms.");
}
void loop() {
  const uint32_t now = millis();
  static uint32_t levelAt = 0, rainAt = 0, dhtAt = 0, oledAt = 0, snapshotAt = 0, serialAt = 0;
  actualizarAlarma(now);
  if (now - levelAt >= NIVEL_MS) { levelAt = now; leerNivel(now); }
  actualizarAlarma(millis());
  if (now - rainAt >= LLUVIA_MS) { rainAt = now; reading.rainRaw = analogRead(PIN_FC37_AO); reading.rainAt = now; }
  if (now - dhtAt >= DHT_MS) {
    dhtAt = now;
    float temperature = dht.readTemperature(), humidity = dht.readHumidity();
    reading.climateValid = isfinite(temperature) && isfinite(humidity);
    if (reading.climateValid) { reading.temperature = temperature; reading.humidity = humidity; reading.climateAt = now; }
  }
  if (now - oledAt >= OLED_MS) { oledAt = now; mostrarOLED(); }
  if (now - snapshotAt >= SNAPSHOT_MS) {
    snapshotAt = now; reading.uptime = now; ++reading.sequence;
    if (outgoing) xQueueOverwrite(outgoing, &reading);
  }
  if (now - serialAt >= 2000) {
    serialAt = now;
    Serial.printf("Nivel=%.2f cm | distancia=%.2f cm | velocidad=%.2f cm/min | eco=%s | T=%.1f C | HR=%.1f %% | clima=%s | lluviaADC=%d | estado=%s\n",
      reading.level, reading.distance, reading.rate, reading.levelValid ? "OK" : "FALLO", reading.temperature, reading.humidity,
      reading.climateValid ? "OK" : "FALLO", reading.rainRaw, textoEstado(reading.state));
  }
  vTaskDelay(pdMS_TO_TICKS(1));
}
