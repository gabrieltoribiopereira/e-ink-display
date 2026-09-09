// e-ink display firmware.
//
// Wake -> (button: draw a stored screen from flash, no radio)
//      -> (timer/boot: sync frames from Supabase, redraw only if the visible one changed)
//      -> deep sleep. loop() never runs.
//
// Frames are 800x480 at 2 bits per pixel (4 grays), 96000 bytes exactly,
// stored in LittleFS together with one .hash file per screen.

#include "config.h"
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <LittleFS.h>
#include <SPI.h>
#include <mbedtls/sha256.h>

// Pins are fixed by the Waveshare ESP32 e-Paper driver board PCB.
const int PIN_CLK = 13, PIN_DIN = 14, PIN_CS = 15;
const int PIN_BUSY = 25, PIN_RST = 26, PIN_DC = 27;
const int BUTTONS[4] = {32, 33, 34, 35};

const char* SCREENS[] = {"inicio", "calendario", "calendario-semana", "todo", "habitos"};
const int NUM_SCREENS = 5;
const int FRAME_BYTES = 800 * 480 * 2 / 8;   // 96000

RTC_DATA_ATTR int wakeCount = 0;
RTC_DATA_ATTR int currentScreen = 0;         // index into SCREENS, survives deep sleep

// ---------- panel driver (UC8179 controller) ----------

void cmd(uint8_t c) {
  digitalWrite(PIN_DC, LOW);
  digitalWrite(PIN_CS, LOW);
  SPI.transfer(c);
  digitalWrite(PIN_CS, HIGH);
}

void data(const uint8_t* d, int n) {
  digitalWrite(PIN_DC, HIGH);
  digitalWrite(PIN_CS, LOW);
  for (int i = 0; i < n; i++) SPI.transfer(d[i]);
  digitalWrite(PIN_CS, HIGH);
}

void cmdData(uint8_t c, const uint8_t* d, int n) { cmd(c); data(d, n); }

// BUSY is LOW while the panel works; 0x71 refreshes the status flag.
bool waitBusy(uint32_t limit = 40000) {
  uint32_t t0 = millis();
  while (true) {
    cmd(0x71);
    if (digitalRead(PIN_BUSY)) return true;
    if (millis() - t0 > limit) return false;   // panel hung
    delay(20);
  }
}

void resetPanel() {
  digitalWrite(PIN_RST, HIGH); delay(20);
  digitalWrite(PIN_RST, LOW);  delay(2);
  digitalWrite(PIN_RST, HIGH); delay(20);
}

// Init sequences from Waveshare's official EPD_7in5_V2.c. The 4-gray mode
// needs no LUT tables: 0xE0/0xE5 select a factory 4-gray waveform from OTP.
void epdInit(bool fourGrays) {
  resetPanel();
  if (fourGrays) {
    const uint8_t panel[]   = { 0x1F };
    const uint8_t vcom[]    = { 0x10, 0x07 };
    const uint8_t booster[] = { 0x27, 0x27, 0x18, 0x17 };
    const uint8_t e0[] = { 0x02 }, e5[] = { 0x5F };
    cmdData(0x00, panel, 1);
    cmdData(0x50, vcom, 2);
    cmd(0x04); delay(100); waitBusy();          // power on
    cmdData(0x06, booster, 4);
    cmdData(0xE0, e0, 1);
    cmdData(0xE5, e5, 1);
  } else {
    const uint8_t power[]   = { 0x07, 0x07, 0x3f, 0x3f };
    const uint8_t booster[] = { 0x17, 0x17, 0x27, 0x17 };
    const uint8_t panel[]   = { 0x1F };
    const uint8_t res[]     = { 0x03, 0x20, 0x01, 0xE0 };   // 800 x 480
    const uint8_t dual[]    = { 0x00 };
    const uint8_t vcom[]    = { 0x10, 0x07 };
    const uint8_t tcon[]    = { 0x22 };
    cmdData(0x01, power, 4);
    cmdData(0x06, booster, 4);
    cmd(0x04); delay(100); waitBusy();          // power on
    cmdData(0x00, panel, 1);
    cmdData(0x61, res, 4);
    cmdData(0x15, dual, 1);
    cmdData(0x50, vcom, 2);
    cmdData(0x60, tcon, 1);
  }
}

void epdSleep() {
  const uint8_t border[] = { 0xF7 };
  const uint8_t a5[]     = { 0xA5 };
  cmdData(0x50, border, 1);
  cmd(0x02); waitBusy();                        // power off
  cmdData(0x07, a5, 1);                         // panel deep sleep
}

// Streams one bit-plane to the panel. The .bin has 4 pixels per byte,
// MSB first, level 0=black .. 3=white (that's what the converter writes).
// bit[level] says what this plane's bit is for each gray level.
// The whole frame never sits in RAM: 2 KB in, 1 KB out, chunk by chunk.
void writePlane(File& f, uint8_t command, const uint8_t bit[4]) {
  uint8_t table[256];
  for (int b = 0; b < 256; b++) {
    uint8_t v = 0;
    for (int k = 0; k < 4; k++) {
      int level = (b >> (6 - 2 * k)) & 3;
      v = (v << 1) | bit[level];
    }
    table[b] = v;
  }

  static uint8_t inBuf[2048], outBuf[1024];
  f.seek(0);
  cmd(command);
  digitalWrite(PIN_DC, HIGH);
  digitalWrite(PIN_CS, LOW);
  int n;
  while ((n = f.read(inBuf, sizeof(inBuf))) > 0) {
    for (int i = 0; i < n; i += 2)
      outBuf[i >> 1] = (table[inBuf[i]] << 4) | table[inBuf[i + 1]];
    SPI.writeBytes(outBuf, n >> 1);
  }
  digitalWrite(PIN_CS, HIGH);
}

bool drawScreen(const char* name) {
  File f = LittleFS.open(String("/") + name + ".bin", "r");
  if (!f || f.size() != FRAME_BYTES) {
    Serial.printf("no valid frame for %s\n", name);
    return false;
  }
  Serial.printf("Drawing %s\n", name);

  epdInit(FOUR_GRAYS);
  if (FOUR_GRAYS) {
    // Plane bits per gray level {black, dark, light, white},
    // matching Waveshare's official EPD_7IN5_V2_Display_4Gray.
    const uint8_t plane10[4] = {1, 0, 1, 0};
    const uint8_t plane13[4] = {1, 1, 0, 0};
    writePlane(f, 0x10, plane10);
    writePlane(f, 0x13, plane13);
  } else {
    const uint8_t plane10[4] = {0, 0, 1, 1};  // 1 = white
    const uint8_t plane13[4] = {1, 1, 0, 0};  // complement
    writePlane(f, 0x10, plane10);
    writePlane(f, 0x13, plane13);
  }
  f.close();

  cmd(0x12); delay(100);                      // refresh
  bool ok = waitBusy();
  epdSleep();
  return ok;
}

// ---------- network ----------

bool connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Connecting to WiFi");

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - start > 15000) {
      Serial.println(" failed, giving up");
      return false;
    }
    delay(250);
    Serial.print(".");
  }

  Serial.printf(" connected, IP %s\n", WiFi.localIP().toString().c_str());
  return true;
}

String fetchManifest() {
  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  http.begin(client, FRAMES_URL);
  http.addHeader("x-device-token", DEVICE_TOKEN);

  int code = http.GET();
  if (code != 200) {
    Serial.printf("Manifest request failed: HTTP %d\n", code);
    http.end();
    return "";
  }

  String body = http.getString();
  http.end();
  return body;
}

void toHex(const uint8_t* d, char* out) {
  const char* h = "0123456789abcdef";
  for (int i = 0; i < 32; i++) {
    out[i * 2]     = h[d[i] >> 4];
    out[i * 2 + 1] = h[d[i] & 15];
  }
  out[64] = 0;
}

// Downloads to /<name>.tmp while hashing, verifies size + sha256 against the
// manifest, and only then renames over /<name>.bin: the stored frame is always
// either the old one or the new one, never half of each.
bool downloadFrameOnce(const char* name, int expectedBytes, const char* expectedHash) {
  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  http.begin(client, String(FRAMES_URL) + "?p=" + name);
  http.addHeader("x-device-token", DEVICE_TOKEN);

  int code = http.GET();
  if (code != 200) {
    Serial.printf("  %s: HTTP %d\n", name, code);
    http.end();
    return false;
  }

  String tmpPath = String("/") + name + ".tmp";
  File f = LittleFS.open(tmpPath, "w");
  if (!f) {
    http.end();
    return false;
  }

  mbedtls_sha256_context sha;
  mbedtls_sha256_init(&sha);
  mbedtls_sha256_starts(&sha, 0);

  WiFiClient* stream = http.getStreamPtr();
  static uint8_t buf[2048];
  int total = 0;
  unsigned long start = millis();

  while (total < expectedBytes && millis() - start < 30000) {
    int n = stream->read(buf, sizeof(buf));
    if (n > 0) {
      f.write(buf, n);
      mbedtls_sha256_update(&sha, buf, n);
      total += n;
    } else {
      delay(1);
    }
  }
  f.close();
  http.end();

  uint8_t digest[32];
  char hex[65];
  mbedtls_sha256_finish(&sha, digest);
  mbedtls_sha256_free(&sha);
  toHex(digest, hex);

  if (total != expectedBytes || strcmp(hex, expectedHash) != 0) {
    Serial.printf("  %s: corrupt download (%d bytes)\n", name, total);
    LittleFS.remove(tmpPath);
    return false;
  }

  String binPath = String("/") + name + ".bin";
  LittleFS.remove(binPath);
  LittleFS.rename(tmpPath, binPath);
  return true;
}

// The Edge Function shuts down when idle and the first request after a while
// can fail while it cold-starts. Since we wake every 20 min, we hit that
// almost every time: without retries the screen would go stale.
bool downloadFrame(const char* name, int expectedBytes, const char* expectedHash) {
  for (int attempt = 1; attempt <= 3; attempt++) {
    if (downloadFrameOnce(name, expectedBytes, expectedHash)) return true;
    if (attempt < 3) {
      Serial.printf("  %s: retry %d\n", name, attempt);
      delay(3000);
    }
  }
  return false;
}

// ---------- hash memory in flash ----------

String savedHash(const char* name) {
  File f = LittleFS.open(String("/") + name + ".hash", "r");
  if (!f) return "";
  String h = f.readString();
  f.close();
  return h;
}

void saveHash(const char* name, const char* hash) {
  File f = LittleFS.open(String("/") + name + ".hash", "w");
  if (!f) return;
  f.print(hash);
  f.close();
}

// ---------- sync ----------

// Returns true if the screen currently on the panel got a new frame.
// (Not called sync(): that name already belongs to a system function.)
bool syncFrames() {
  if (!connectWiFi()) return false;

  String manifest = fetchManifest();
  for (int t = 0; t < 2 && manifest == ""; t++) {
    delay(3000);
    manifest = fetchManifest();
  }
  if (manifest == "") return false;

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, manifest);
  if (err) {
    Serial.println("Manifest is not valid JSON");
    return false;
  }

  bool currentChanged = false;
  int updated = 0;
  for (int i = 0; i < NUM_SCREENS; i++) {
    const char* hash = doc["pantallas"][SCREENS[i]]["hash"];
    int bytes = doc["pantallas"][SCREENS[i]]["bytes"] | 0;
    if (hash == NULL || bytes != FRAME_BYTES) {
      Serial.printf("  %-17s missing or wrong size in manifest!\n", SCREENS[i]);
      continue;
    }
    if (savedHash(SCREENS[i]) == hash) {
      Serial.printf("  %-17s no changes\n", SCREENS[i]);
      continue;
    }
    if (downloadFrame(SCREENS[i], bytes, hash)) {
      saveHash(SCREENS[i], hash);
      Serial.printf("  %-17s downloaded\n", SCREENS[i]);
      updated++;
      if (i == currentScreen) currentChanged = true;
    }
  }
  Serial.printf("Sync done: %d of %d updated\n", updated, NUM_SCREENS);

  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  return currentChanged;
}

// ---------- navigation (mirrors the button bar in web/script.js) ----------

int indexOf(const char* name) {
  for (int i = 0; i < NUM_SCREENS; i++)
    if (strcmp(SCREENS[i], name) == 0) return i;
  return 0;
}

int navigate(int current, int button) {
  const char* name = SCREENS[current];
  if (strcmp(name, "inicio") == 0) {
    if (button == 2) return indexOf("calendario");
    if (button == 3) return indexOf("todo");
    if (button == 4) return indexOf("habitos");
    return current;
  }
  if (button == 1) return indexOf("inicio");   // Start = back, on every screen
  if (strcmp(name, "calendario") == 0 && button == 4) return indexOf("calendario-semana");
  if (strcmp(name, "calendario-semana") == 0 && button == 4) return indexOf("calendario");
  return current;   // Up/Down/Done need the server; offline they do nothing
}

// ---------- wake cycle ----------

int buttonPressed() {
  uint64_t mask = esp_sleep_get_ext1_wakeup_status();
  for (int i = 0; i < 4; i++)
    if (mask & (1ULL << BUTTONS[i])) return i + 1;
  return 0;
}

void goToSleep() {
  Serial.println("Going to sleep");
  uint64_t mask = 0;
  for (int i = 0; i < 4; i++) mask |= 1ULL << BUTTONS[i];
  esp_sleep_enable_ext1_wakeup(mask, ESP_EXT1_WAKEUP_ANY_HIGH);
  esp_sleep_enable_timer_wakeup((uint64_t)INTERVAL_S * 1000000ULL);
  Serial.flush();
  esp_deep_sleep_start();
}

void setup() {
  Serial.begin(115200);
  delay(300);

  pinMode(PIN_CS, OUTPUT);  digitalWrite(PIN_CS, HIGH);
  pinMode(PIN_DC, OUTPUT);  digitalWrite(PIN_DC, LOW);
  pinMode(PIN_RST, OUTPUT); digitalWrite(PIN_RST, HIGH);
  pinMode(PIN_BUSY, INPUT);
  for (int i = 0; i < 4; i++) pinMode(BUTTONS[i], INPUT);

  SPI.begin(PIN_CLK, -1, PIN_DIN, PIN_CS);
  SPI.beginTransaction(SPISettings(10000000, MSBFIRST, SPI_MODE0));

  if (!LittleFS.begin(true)) {
    Serial.println("LittleFS failed!");
    goToSleep();
  }
  wakeCount++;

  esp_sleep_wakeup_cause_t cause = esp_sleep_get_wakeup_cause();

  if (cause == ESP_SLEEP_WAKEUP_EXT1) {
    int button = buttonPressed();
    int next = navigate(currentScreen, button);
    Serial.printf("Wake %d: button %d -> %s\n", wakeCount, button, SCREENS[next]);
    if (next != currentScreen) {
      currentScreen = next;
      drawScreen(SCREENS[currentScreen]);
    }
  } else if (cause == ESP_SLEEP_WAKEUP_TIMER) {
    Serial.printf("Wake %d: timer, time to sync\n", wakeCount);
    if (syncFrames()) drawScreen(SCREENS[currentScreen]);
  } else {
    Serial.printf("Wake %d: first boot\n", wakeCount);
    syncFrames();
    drawScreen(SCREENS[currentScreen]);   // always paint something on power-up
  }

  goToSleep();
}

void loop() {
}
