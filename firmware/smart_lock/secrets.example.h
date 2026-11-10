// Copy this file to secrets.h and fill in your own values.
#pragma once

// Your home Wi-Fi
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Static IP for the ESP32 on your network (pick a free one outside your router's DHCP range)
#define STATIC_IP   192, 168, 1, 50
#define GATEWAY_IP  192, 168, 1, 1
#define SUBNET_MASK 255, 255, 255, 0

// Token the web client must send in the X-Api-Token header to open the lock.
// Use a long random string, e.g. the output of: openssl rand -hex 32
const char* API_TOKEN = "CHANGE_ME_TO_A_LONG_RANDOM_TOKEN";
