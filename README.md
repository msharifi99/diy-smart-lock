# DIY Smart Lock

An ESP32 that turns the thumb-turn knob of a door cylinder with a servo, plus a small web app (PWA) to open the door from your phone.

You can read the full story in my blog post: **[My Recipe for a DIY Smart Lock](https://rebbin.dev/posts/diy-smart-lock/)**.

## How it works

1. The web app sends `POST /open` to the ESP32 with your token in the `X-Api-Token` header.
2. The ESP32 rotates the servo 90°, waits 1 second, then rotates it back to 0°.
3. Between moves the servo is **detached**, so it doesn't fight you if you turn the knob by hand.

```
cad/                    3D-printable parts (3MF/STL) and editable CAD (STEP/F3D)
client/                 React + Vite PWA (the control panel)
firmware/smart_lock/    Arduino sketch for the ESP32
```

## Hardware

- An ESP32 board with Wi-Fi
- A positional servo (signal on **GPIO 18**)
- A door cylinder with a **thumb-turn knob** on the inside, of a type that opens the lock when you turn it
- A 5V 3A power adapter, plus a buck converter that steps 5V down to 3.3V for the ESP32
- 3D-printed parts: a connector from the servo horn to the knob, and a mount that holds the servo on the door

## 3D-printed parts

All parts are in [`cad/`](cad/). Use the **3MF** (or STL) files to print, and the **STEP** or Fusion 360 (**F3D/F3Z**) files to edit.

| Part | Folder | What it does |
|---|---|---|
| Lock connector | [`cad/Connector`](cad/Connector) | Fits the servo horn on one end and the cylinder's thumb-turn knob on the other |
| Door base | [`cad/Door base`](cad/Door%20base) | Gets fixed on the door and holds the handles |
| Handles | [`cad/Handles`](cad/Handles) | Slot into the base and clamp the servo body in place (you need two) |

## 1. Firmware (ESP32)

1. Install the [Arduino IDE](https://www.arduino.cc/en/software), the **esp32** board package (by Espressif) and the **ESP32Servo** library.
2. Copy the secrets template:
   ```bash
   cp firmware/smart_lock/secrets.example.h firmware/smart_lock/secrets.h
   ```
3. Open `secrets.h` and set your Wi-Fi name and password, a free static IP for the board, and a long random `API_TOKEN` (for example from `openssl rand -hex 32`). The token is what stops anyone else on your network from opening the door.
4. Open `firmware/smart_lock/smart_lock.ino`, select your ESP32 board and port, and upload.
5. Open the Serial Monitor at **9600 baud**. You should see the board's IP. You can also type `open`, `status`, `ip`, `stop` or `servo <angle>` there to test the servo before it's on the door.

You can tune these values at the top of the sketch:

| Constant | Default | What it does |
|---|---|---|
| `SERVO_PIN` | `18` | GPIO pin for the servo signal |
| `SERVO_CLOSED_ANGLE` / `SERVO_OPEN_ANGLE` | `0` / `90` | Rest position, and how far it turns to open |
| `SERVO_OPEN_HOLD_MS` | `1000` | How long it stays open before turning back |

### API

| Method | Path | Auth | Response |
|---|---|---|---|
| `GET` | `/status` | none | JSON with `state`, `busy`, `ip`, … |
| `POST` | `/open` | `X-Api-Token` header | `200` started, `401` bad token, `409` busy |

```bash
curl -X POST http://192.168.1.50/open -H "X-Api-Token: YOUR_TOKEN"
```

## 2. Web client

Requires Node.js 18+.

```bash
cd client
cp .env.example .env    # optional: set VITE_LOCK_URL and VITE_API_TOKEN
npm install
npm run dev             # http://localhost:3000
```

You can also leave `.env` empty and type the URL and token into the app. While `npm run dev` is running, requests to `/board/*` are proxied to the ESP32 (set the IP in `vite.config.js`).

`npm run build` produces a static PWA in `client/dist` that you can host anywhere and "Add to Home Screen" on your phone. Vite builds the values from `.env` into the JavaScript, so **don't publicly host a build that contains your token**.

## Opening it from outside your home network

Out of the box this only works on your local network. To open the door over the internet, put the ESP32 behind something that adds HTTPS, such as a reverse proxy or a tunnel (Cloudflare Tunnel, Tailscale, …). The ESP32 only speaks plain HTTP, so never forward its port straight to the internet. Your token would travel unencrypted.

## Safety

This is a hobby project, not a certified lock. Keep a physical key, and make sure the knob can still be turned by hand when the power is off.
