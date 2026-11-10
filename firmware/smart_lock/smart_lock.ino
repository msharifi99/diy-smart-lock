#include <WiFi.h>
#include <WebServer.h>
#include <ESP32Servo.h>
#include <functional>

// ===== Secrets & network config =====
// Copy secrets.example.h to secrets.h and fill in your own values.
// secrets.h is gitignored so your credentials never get committed.
#include "secrets.h"

IPAddress local_IP(STATIC_IP);
IPAddress gateway(GATEWAY_IP);
IPAddress subnet(SUBNET_MASK);

// ===== Web server =====
WebServer server(80);

// ===== Headers collection =====
const char* headerKeys[] = {"X-Api-Token"};
const size_t headerKeysCount = sizeof(headerKeys) / sizeof(char*);

// ===== Servo setup =====
Servo myServo;
const int SERVO_PIN = 18;

// Positional servo angles
const int SERVO_CLOSED_ANGLE = 0;
const int SERVO_OPEN_ANGLE = 90;

// Timing
const unsigned long SERVO_MOVE_SETTLE_MS = 700; // time for servo to reach target angle
const unsigned long SERVO_OPEN_HOLD_MS = 1000;  // how long to stay open before closing

// Prevent overlapping commands
bool isBusy = false;
bool isServoAttached = false;

using Handler = std::function<void()>;

String serial_monitor_input = "";

// ===== Lock state machine =====
enum LockState {
  LOCK_IDLE,
  LOCK_OPENING,
  LOCK_HOLDING_OPEN,
  LOCK_CLOSING
};

LockState currentLockState = LOCK_IDLE;
unsigned long lockStateStartedAt = 0;

const char* lockStateToString(LockState state) {
  switch (state) {
    case LOCK_IDLE:
      return "IDLE";
    case LOCK_OPENING:
      return "OPENING";
    case LOCK_HOLDING_OPEN:
      return "HOLDING_OPEN";
    case LOCK_CLOSING:
      return "CLOSING";
    default:
      return "UNKNOWN";
  }
}

void logLine(const char* message) {
  Serial.println(message);
}

void addCorsHeaders() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type, X-Api-Token");
}

Handler withCors(Handler handler) {
  return [handler]() {
    addCorsHeaders();
    handler();
  };
}

bool isAuthorized() {
  // Preferred: token in header
  if (server.hasHeader("X-Api-Token")) {
    return server.header("X-Api-Token") == API_TOKEN;
  }

  // Backward-compatible fallback: token in query string
  if (server.hasArg("token")) {
    return server.arg("token") == API_TOKEN;
  }

  return false;
}

void attachServoIfNeeded() {
  if (!isServoAttached) {
    myServo.attach(SERVO_PIN);
    isServoAttached = true;
    Serial.println("Servo attached");
    delay(50); // small delay to stabilize PWM
  }
}

void detachServoIfNeeded() {
  if (isServoAttached) {
    myServo.detach();
    isServoAttached = false;
    Serial.println("Servo detached");
  }
}

void moveServoToClosed() {
  attachServoIfNeeded();
  myServo.write(SERVO_CLOSED_ANGLE);
}

void moveServoToOpen() {
  attachServoIfNeeded();
  myServo.write(SERVO_OPEN_ANGLE);
}

void startOpenRoutine() {
  isBusy = true;
  currentLockState = LOCK_OPENING;
  lockStateStartedAt = millis();

  Serial.println("Starting openLockRoutine");
  Serial.print("Moving to open angle: ");
  Serial.println(SERVO_OPEN_ANGLE);

  moveServoToOpen();
}

void finishOpenRoutine() {
  detachServoIfNeeded();
  currentLockState = LOCK_IDLE;
  isBusy = false;

  Serial.println("Lock routine finished");
  Serial.println("Device is ready again");
}

void cancelOpenRoutine() {
  moveServoToClosed();
  delay(SERVO_MOVE_SETTLE_MS);
  detachServoIfNeeded();

  currentLockState = LOCK_IDLE;
  isBusy = false;

  Serial.println("Routine cancelled");
}

void updateLockState() {
  if (!isBusy) {
    return;
  }

  unsigned long now = millis();
  unsigned long elapsed = now - lockStateStartedAt;

  switch (currentLockState) {
    case LOCK_OPENING:
      if (elapsed >= SERVO_MOVE_SETTLE_MS) {
        Serial.println("Servo reached open position, detaching and holding");
        detachServoIfNeeded();

        currentLockState = LOCK_HOLDING_OPEN;
        lockStateStartedAt = now;
      }
      break;

    case LOCK_HOLDING_OPEN:
      if (elapsed >= SERVO_OPEN_HOLD_MS) {
        Serial.print("Attaching servo and moving back to closed angle: ");
        Serial.println(SERVO_CLOSED_ANGLE);

        moveServoToClosed();
        currentLockState = LOCK_CLOSING;
        lockStateStartedAt = now;
      }
      break;

    case LOCK_CLOSING:
      if (elapsed >= SERVO_MOVE_SETTLE_MS) {
        finishOpenRoutine();
      }
      break;

    case LOCK_IDLE:
    default:
      break;
  }
}

void handleSerial() {
  while (Serial.available()) {
    char c = Serial.read();

    if (c == '\n' || c == '\r') {
      if (serial_monitor_input.length() == 0) {
        continue;
      }

      serial_monitor_input.trim();

      Serial.print("Received command: ");
      Serial.println(serial_monitor_input);

      if (serial_monitor_input == "ip") {
        Serial.print("IP address: ");
        Serial.println(WiFi.localIP());

      } else if (serial_monitor_input == "status") {
        Serial.print("WiFi status: ");
        Serial.println(WiFi.status() == WL_CONNECTED ? "connected" : "not connected");

        Serial.print("Busy: ");
        Serial.println(isBusy ? "true" : "false");

        Serial.print("Lock state: ");
        Serial.println(lockStateToString(currentLockState));

        Serial.print("Servo attached: ");
        Serial.println(isServoAttached ? "true" : "false");

      } else if (serial_monitor_input == "open") {
        if (isBusy) {
          Serial.println("Rejected: device is busy");
        } else {
          startOpenRoutine();
        }

      } else if (serial_monitor_input == "stop") {
        cancelOpenRoutine();

      } else if (serial_monitor_input == "attach") {
        attachServoIfNeeded();

      } else if (serial_monitor_input == "detach") {
        detachServoIfNeeded();

      } else if (serial_monitor_input.startsWith("servo ")) {
        int angle = serial_monitor_input.substring(6).toInt();

        Serial.print("Writing servo angle: ");
        Serial.println(angle);

        attachServoIfNeeded();
        myServo.write(angle);

      } else {
        Serial.println("Unknown command");
      }

      serial_monitor_input = "";
    } else {
      serial_monitor_input += c;
    }
  }
}

void handleStatus() {
  String json = "{";
  json += "\"status\":\"online\",";
  json += "\"wifiConnected\":";
  json += (WiFi.status() == WL_CONNECTED ? "true" : "false");
  json += ",";
  json += "\"busy\":";
  json += (isBusy ? "true" : "false");
  json += ",";
  json += "\"servoAttached\":";
  json += (isServoAttached ? "true" : "false");
  json += ",";
  json += "\"state\":\"";
  json += lockStateToString(currentLockState);
  json += "\",";
  json += "\"ip\":\"";
  json += WiFi.localIP().toString();
  json += "\",";
  json += "\"closedAngle\":";
  json += SERVO_CLOSED_ANGLE;
  json += ",";
  json += "\"openAngle\":";
  json += SERVO_OPEN_ANGLE;
  json += "}";

  server.send(200, "application/json", json);
}

void handleOpen() {
  Serial.println("Received /open request");

  if (!isAuthorized()) {
    Serial.println("Unauthorized request");
    server.send(401, "application/json", "{\"error\":\"unauthorized\"}");
    return;
  }

  if (isBusy) {
    Serial.println("Rejected: device is busy");
    server.send(409, "application/json", "{\"error\":\"busy\",\"state\":\"LOCK_IN_PROGRESS\"}");
    return;
  }

  startOpenRoutine();

  server.send(200, "application/json", "{\"success\":true,\"message\":\"open routine started\"}");
}

void handleOptions() {
  addCorsHeaders();
  server.send(204);
}

void handleRoot() {
  server.send(200, "text/plain", "ESP32 is online");
}

void handleNotFound() {
  addCorsHeaders();
  server.send(404, "text/plain", "Not found");
}

void connectToWifi() {
  Serial.print("Connecting to Wi-Fi: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.config(local_IP, gateway, subnet);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    attempts++;

    if (attempts >= 60) {
      Serial.println("\nFailed to connect to Wi-Fi.");
      Serial.println("Check SSID/password and try again.");
      return;
    }
  }

  Serial.println("\nWi-Fi connected.");
  Serial.print("ESP32 IP address: ");
  Serial.println(WiFi.localIP());
  Serial.print("ESP32 MAC: ");
  Serial.println(WiFi.macAddress());
}

void setupRoutes() {
  server.on("/", HTTP_GET, withCors(handleRoot));
  server.on("/status", HTTP_GET, withCors(handleStatus));
  server.on("/open", HTTP_POST, withCors(handleOpen));

  server.on("/open", HTTP_OPTIONS, handleOptions);
  server.on("/status", HTTP_OPTIONS, handleOptions);
  server.on("/", HTTP_OPTIONS, handleOptions);

  server.onNotFound(handleNotFound);
}

void setup() {
  Serial.begin(9600);

  attachServoIfNeeded();
  moveServoToClosed();
  delay(1000);
  detachServoIfNeeded();

  connectToWifi();
  setupRoutes();

  server.collectHeaders(headerKeys, headerKeysCount);
  server.begin();
  Serial.println("HTTP server started.");
}

void loop() {
  server.handleClient();
  handleSerial();
  updateLockState();
}