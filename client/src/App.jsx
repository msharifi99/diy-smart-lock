import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Lock,
  Unlock,
  Wifi,
  WifiOff,
  ShieldCheck,
  Activity,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  KeyRound,
  Server,
  Clock3,
  Power,
  Copy,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

const DEFAULT_URL = import.meta.env.VITE_LOCK_URL || "http://192.168.1.50";
const DEFAULT_POLL_MS = 5000;

function toneClasses(kind) {
  switch (kind) {
    case "success":
      return "border-green-200 bg-green-50 text-green-800";
    case "error":
      return "border-red-200 bg-red-50 text-red-800";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-800";
    default:
      return "border-slate-200 bg-slate-50 text-slate-800";
  }
}

function stateTone(state) {
  switch (state) {
    case "IDLE":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "MOVING_FORWARD":
      return "bg-sky-100 text-sky-800 border-sky-200";
    case "PAUSING":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "MOVING_REVERSE":
      return "bg-violet-100 text-violet-800 border-violet-200";
    default:
      return "bg-slate-100 text-slate-800 border-slate-200";
  }
}

function stateLabel(state) {
  switch (state) {
    case "IDLE":
      return "Ready";
    case "MOVING_FORWARD":
      return "Unlocking";
    case "PAUSING":
      return "Holding";
    case "MOVING_REVERSE":
      return "Relocking";
    default:
      return state || "Unknown";
  }
}

function formatTime(date) {
  if (!date) return "—";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function JsonPreview({ data }) {
  return (
    <pre className="overflow-x-auto rounded-2xl border bg-slate-950 p-4 text-xs text-slate-100">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

export default function DoorLockControlApp() {
  const [url, setUrl] = useState(DEFAULT_URL);
  const [token, setToken] = useState(import.meta.env.VITE_API_TOKEN || "");
  const [showToken, setShowToken] = useState(false);
  const [autoPoll, setAutoPoll] = useState(false);
  const [pollMs, setPollMs] = useState(DEFAULT_POLL_MS);
  const [status, setStatus] = useState(null);
  const [rawStatus, setRawStatus] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [opening, setOpening] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState(null);
  const [notice, setNotice] = useState({
    kind: "info",
    text: "Ready. Connect to your ESP32 and test the lock.",
  });
  const [history, setHistory] = useState([]);

  const addHistory = (kind, text) => {
    setHistory((prev) =>
      [
        {
          id: `${new Date().getTime()}-${Math.random() * 10}`,
          kind,
          text,
          at: new Date().toISOString(),
        },
        ...prev,
      ].slice(0, 12),
    );
  };

  const baseUrl = url ? url.replace(/\/+$/, "") : "";
  const statusUrl = baseUrl ? `${baseUrl}/status` : "";
  const openUrl = baseUrl ? `${baseUrl}/open` : "";

  const isBusy = Boolean(status?.busy);
  const state = status?.state || "UNKNOWN";
  const wifiConnected = status?.wifiConnected;
  const canOpen = !!url && !!token && !isBusy && !opening;

  const fetchStatus = async ({ silent = false } = {}) => {
    if (!url || !token) {
      if (!silent)
        setNotice({
          kind: "warning",
          text: "Enter the ESP32 URL and API token first.",
        });
      return;
    }

    if (!silent) setLoadingStatus(true);
    try {
      const response = await fetch(statusUrl, {
        method: "GET",
        headers: {
          "X-API-Token": token,
        },
      });

      const text = await response.text();
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { raw: text };
      }

      setRawStatus(payload);
      setLastCheckedAt(new Date());

      if (!response.ok) {
        const message =
          payload?.error ||
          text ||
          `Status check failed with ${response.status}`;
        setStatus(null);
        setNotice({ kind: "error", text: message });
        addHistory("error", `Status check failed: ${message}`);
        return;
      }

      setStatus(payload);
      if (!silent) {
        setNotice({
          kind: "success",
          text: `Connected. Device state is ${stateLabel(payload?.state)}.`,
        });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to reach the ESP32.";
      setStatus(null);
      setLastCheckedAt(new Date());
      setNotice({ kind: "error", text: `Request failed: ${message}` });
      addHistory("error", `Network error while fetching status: ${message}`);
    } finally {
      if (!silent) setLoadingStatus(false);
    }
  };

  const openLock = async () => {
    if (!canOpen) return;

    setOpening(true);
    setNotice({ kind: "info", text: "Sending unlock command…" });

    try {
      const response = await fetch(openUrl, {
        method: "POST",
        headers: {
          "X-API-Token": token,
        },
      });

      const text = await response.text();
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { raw: text };
      }

      if (!response.ok) {
        const message =
          payload?.error || text || `Open failed with ${response.status}`;
        setNotice({ kind: "error", text: message });
        addHistory("error", `Open failed: ${message}`);
        return;
      }

      setNotice({
        kind: "success",
        text: payload?.message || "Open routine started successfully.",
      });
      addHistory("success", "Open routine started.");
      await fetchStatus({ silent: true });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to send the open command.";
      setNotice({ kind: "error", text: `Request failed: ${message}` });
      addHistory("error", `Open request failed: ${message}`);
    } finally {
      setOpening(false);
      const id = setInterval(async () => {
        await fetchStatus({ silent: true });
      }, 2500);
      setTimeout(async () => {
        clearInterval(id);
      }, 5000);
    }
  };

  useEffect(() => {
    if (!autoPoll || !url || !token) return;

    const id = window.setInterval(
      () => {
        fetchStatus({ silent: true });
      },
      Math.max(500, Number(pollMs) || DEFAULT_POLL_MS),
    );

    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPoll, url, token, pollMs]);

  const fetchRef = useRef(fetchStatus);
  fetchRef.current = fetchStatus;

  useEffect(() => {
    if (!url || !token) return;

    const handle = window.setTimeout(() => {
      fetchRef.current({ silent: true });
    }, 800);

    return () => window.clearTimeout(handle);
  }, [url, token]);

  const copyCurl = async () => {
    const command = `curl -X POST "${baseUrl}/open" -H "X-API-Token: ${token}"`;
    await navigator.clipboard.writeText(command);
    setNotice({ kind: "success", text: "cURL command copied." });
    addHistory("info", "Copied cURL command.");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-slate-200 p-4 md:p-8">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="min-w-0 space-y-6"
        >
          <Card className="overflow-hidden rounded-3xl border-0 shadow-xl">
            <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-6 text-white md:p-8">
              <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs backdrop-blur">
                    <ShieldCheck className="h-4 w-4" />
                    Local secure control
                  </div>
                  <div>
                    <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
                      Door Lock Control
                    </h1>
                    <p className="mt-2 max-w-2xl text-sm text-slate-300 md:text-base">
                      A polished control panel for your ESP32 smart lock with
                      live status, busy-state protection, quick actions, and
                      local-only token auth.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 md:min-w-[280px]">
                  <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                    <div className="text-xs uppercase tracking-wide text-slate-300">
                      Lock state
                    </div>
                    <div className="mt-2 text-lg font-semibold">
                      {stateLabel(state)}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                    <div className="text-xs uppercase tracking-wide text-slate-300">
                      Last check
                    </div>
                    <div className="mt-2 text-lg font-semibold">
                      {formatTime(lastCheckedAt)}
                    </div>
                  </div>
                </div>
              </div>

              <Button
                onClick={openLock}
                disabled={!canOpen}
                className="mt-4 h-16 w-full rounded-2xl bg-white text-slate-900 text-lg font-semibold shadow-lg hover:bg-white/90 lg:hidden"
                size="lg"
              >
                {opening ? (
                  <>
                    <Loader2 className="mr-3 h-5 w-5 animate-spin" /> Sending
                    command…
                  </>
                ) : isBusy ? (
                  <>
                    <Lock className="mr-3 h-5 w-5" /> Lock busy
                  </>
                ) : (
                  <>
                    <Unlock className="mr-3 h-5 w-5" /> Open lock
                  </>
                )}
              </Button>
            </div>
          </Card>

          <div className="grid gap-6">
            <Card className="rounded-3xl shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="h-5 w-5" /> Connection
                </CardTitle>
                <CardDescription>
                  Set the ESP32 address and authentication token. Defaults come
                  from client/.env (see .env.example).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="url">ESP32 URL</Label>
                  <Input
                    id="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="http://192.168.1.50"
                    className="h-11 rounded-xl"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="token">API token</Label>
                  <div className="flex gap-2">
                    <Input
                      id="token"
                      type={showToken ? "text" : "password"}
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder="Your API token"
                      className="h-11 rounded-xl"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 rounded-xl px-3"
                      onClick={() => setShowToken((v) => !v)}
                    >
                      {showToken ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                  <div className="space-y-2">
                    <Label htmlFor="pollMs">Polling interval (ms)</Label>
                    <Input
                      id="pollMs"
                      type="number"
                      min={500}
                      step={100}
                      value={pollMs}
                      onChange={(e) =>
                        setPollMs(Number(e.target.value) || DEFAULT_POLL_MS)
                      }
                      className="h-11 rounded-xl"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-2xl border p-3">
                    <div>
                      <div className="text-sm font-medium">Auto refresh</div>
                      <div className="text-xs text-slate-500">
                        Keep the state live
                      </div>
                    </div>
                    <Switch checked={autoPoll} onCheckedChange={setAutoPoll} />
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button onClick={() => fetchStatus()} className="rounded-2xl">
                    {loadingStatus ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    Refresh status
                  </Button>
                  <Button
                    onClick={copyCurl}
                    variant="outline"
                    className="rounded-2xl"
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copy cURL
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-3xl shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" /> Live device status
                </CardTitle>
                <CardDescription>
                  Real-time information coming from your ESP32{" "}
                  <span className="font-mono">/status</span> endpoint.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div
                  className={`rounded-2xl border p-4 ${toneClasses(notice.kind)}`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    {notice.kind === "success" ? (
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                    ) : notice.kind === "error" ? (
                      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                    ) : (
                      <Activity className="mt-0.5 h-5 w-5 shrink-0" />
                    )}
                    <div className="min-w-0 break-words text-sm font-medium">
                      {notice.text}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div className="rounded-2xl border bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Power className="h-4 w-4" /> Device
                    </div>
                    <div className="mt-3 text-lg font-semibold">
                      {status?.status || "Unknown"}
                    </div>
                  </div>
                  <div className="rounded-2xl border bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      {wifiConnected ? (
                        <Wifi className="h-4 w-4" />
                      ) : (
                        <WifiOff className="h-4 w-4" />
                      )}{" "}
                      Wi-Fi
                    </div>
                    <div className="mt-3 text-lg font-semibold">
                      {wifiConnected === undefined
                        ? "Unknown"
                        : wifiConnected
                          ? "Connected"
                          : "Offline"}
                    </div>
                  </div>
                  <div className="rounded-2xl border bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Clock3 className="h-4 w-4" /> Busy
                    </div>
                    <div className="mt-3 text-lg font-semibold">
                      {isBusy ? "Yes" : "No"}
                    </div>
                  </div>
                  <div className="rounded-2xl border bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <KeyRound className="h-4 w-4" /> State
                    </div>
                    <div className="mt-3">
                      <Badge
                        variant="outline"
                        className={`rounded-full px-3 py-1 text-sm ${stateTone(state)}`}
                      >
                        {stateLabel(state)}
                      </Badge>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
                  <div className="min-w-0 space-y-3 rounded-2xl border bg-slate-50 p-4">
                    <div className="text-sm font-medium text-slate-600">
                      Resolved endpoint
                    </div>
                    <div className="overflow-hidden rounded-xl bg-white p-3 font-mono text-sm text-slate-800 shadow-sm">
                      <div className="truncate">{statusUrl || "—"}</div>
                    </div>
                    <div className="text-sm font-medium text-slate-600">
                      Device-reported IP
                    </div>
                    <div className="overflow-hidden rounded-xl bg-white p-3 font-mono text-sm text-slate-800 shadow-sm">
                      <div className="truncate">{status?.ip || "—"}</div>
                    </div>
                  </div>

                  <div className="min-w-0 space-y-3 rounded-2xl border bg-slate-50 p-4">
                    <div className="text-sm font-medium text-slate-600">
                      Recent events
                    </div>
                    <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                      {history.length === 0 ? (
                        <div className="rounded-xl bg-white p-3 text-sm text-slate-500 shadow-sm">
                          No events yet.
                        </div>
                      ) : (
                        history.map((item) => (
                          <div
                            key={item.id}
                            className={`rounded-xl border p-3 text-sm ${toneClasses(item.kind)}`}
                          >
                            <div className="break-words font-medium">
                              {item.text}
                            </div>
                            <div className="mt-1 text-xs opacity-70">
                              {formatTime(new Date(item.at))}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.08 }}
          className="min-w-0 space-y-6"
        >
          <Card className="rounded-3xl border-0 bg-slate-950 text-white shadow-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Unlock className="h-5 w-5" /> Control panel
              </CardTitle>
              <CardDescription className="text-slate-300">
                The button is automatically disabled while the device is busy.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4">
                <div>
                  <div className="text-sm text-slate-300">Current action</div>
                  <div className="mt-1 text-xl font-semibold">
                    {stateLabel(state)}
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={`rounded-full border px-3 py-1 ${stateTone(state)}`}
                >
                  {state}
                </Badge>
              </div>

              <Button
                onClick={openLock}
                disabled={!canOpen}
                className="h-20 w-full rounded-3xl text-lg font-semibold shadow-lg"
                size="lg"
              >
                {opening ? (
                  <>
                    <Loader2 className="mr-3 h-5 w-5 animate-spin" /> Sending
                    command…
                  </>
                ) : isBusy ? (
                  <>
                    <Lock className="mr-3 h-5 w-5" /> Lock busy
                  </>
                ) : (
                  <>
                    <Unlock className="mr-3 h-5 w-5" /> Open lock
                  </>
                )}
              </Button>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-wide text-slate-400">
                    Ready to send
                  </div>
                  <div className="mt-2 text-base font-medium">
                    {canOpen ? "Yes" : "Not yet"}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-wide text-slate-400">
                    Auth mode
                  </div>
                  <div className="mt-2 text-base font-medium">Header token</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl shadow-lg">
            <CardHeader>
              <CardTitle>Debug inspector</CardTitle>
              <CardDescription>
                Useful while tuning the lock and verifying what the ESP32
                actually returned.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="mb-2 text-sm font-medium text-slate-600">
                  Raw status payload
                </div>
                <JsonPreview
                  data={
                    rawStatus || { note: "No status response received yet." }
                  }
                />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
