import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDown,
  CheckCircle,
  DownloadSimple,
  FileCsv,
  FileText,
  MagnifyingGlass,
  QrCode,
  XCircle,
} from "phosphor-react";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Progress } from "../components/ui/progress";
import { Textarea } from "../components/ui/textarea";
import { cn } from "../lib/utils";

type StatusResponse = {
  status: "disconnected" | "connecting" | "connected";
  qrCode: string | null;
  connected: boolean;
};

type VerifyResultItem = {
  phone: string;
  exists: boolean;
  jid: string | null;
  error?: string;
};

type VerifyResponse = {
  success: true;
  total: number;
  valid: number;
  invalid: number;
  results: VerifyResultItem[];
};

declare global {
  interface Window {
    waChecker?: { ping: () => string };
  }
}

const API_BASE = "http://127.0.0.1:3000";

function sanitizeLine(line: string) {
  return line.trim();
}

function parseHeaderlessCsv(text: string) {
  // Headerless CSV with one column only. Accepts:
  // - separated by newlines (common)
  // - or commas
  // - optional quotes
  return text
    .replace(/\r/g, "")
    .split(/\n|,/g)
    .map((v) => v.replace(/^"|"$/g, "").trim())
    .filter(Boolean);
}

function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toCsv(
  rows: Array<{ phone: string; exists: boolean; error?: string }>
) {
  const header = "phone,exists,error";
  const lines = rows.map((r) => {
    const phone = JSON.stringify(r.phone ?? "");
    const exists = r.exists ? "true" : "false";
    const error = JSON.stringify(r.error ?? "");
    return `${phone},${exists},${error}`;
  });
  return [header, ...lines].join("\n");
}

export default function App() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [numbers, setNumbers] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<VerifyResultItem[] | null>(null);
  const [query, setQuery] = useState<string>("");
  const [verifyProgress, setVerifyProgress] = useState<number>(0);
  const [verifyLabel, setVerifyLabel] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const ping = useMemo(() => window.waChecker?.ping?.(), []);

  useEffect(() => {
    let alive = true;

    async function tick() {
      try {
        const res = await fetch(`${API_BASE}/api/status`);
        const data = (await res.json()) as StatusResponse;
        if (alive) {
          setStatus(data);
          setError(null);
        }
      } catch (e) {
        if (alive) {
          setStatus(null);
          setError("Backend not reachable yet (starting up?)");
        }
      }
    }

    tick();
    const id = setInterval(tick, 1500);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/connect`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Failed to connect");
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/disconnect`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Failed to disconnect");
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      setResults(null);
      setVerifyProgress(8);
      setVerifyLabel("Preparing numbers…");

      const phoneNumbers = numbers
        .split(/\r?\n/)
        .map(sanitizeLine)
        .filter(Boolean);

      // Simulated progress (indeterminate-ish) since backend currently returns results at end.
      // We advance until 92% and complete when response arrives.
      let progressTimer: number | null = null;
      progressTimer = window.setInterval(() => {
        setVerifyProgress((p) => {
          if (p >= 92) return p;
          const bump = p < 30 ? 6 : p < 60 ? 3 : 1;
          return Math.min(92, p + bump);
        });
      }, 350);
      const stopProgress = () => {
        if (progressTimer != null) {
          window.clearInterval(progressTimer);
          progressTimer = null;
        }
      };

      const res = await fetch(`${API_BASE}/api/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phoneNumbers }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Verification failed");

      const typed = body as VerifyResponse;
      setResults(typed.results);

      stopProgress();
      setVerifyProgress(100);
      setVerifyLabel(`Done • ${typed.valid} valid, ${typed.invalid} invalid`);
      window.setTimeout(() => {
        setVerifyProgress(0);
        setVerifyLabel("");
      }, 1200);
    } catch (e: any) {
      setVerifyLabel("");
      setVerifyProgress(0);
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  function onPickCsv() {
    fileInputRef.current?.click();
  }

  async function onCsvSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const values = parseHeaderlessCsv(text);
      const merged = [
        ...numbers.split(/\r?\n/).map(sanitizeLine).filter(Boolean),
        ...values,
      ]
        .map((v) => v.trim())
        .filter(Boolean);
      setNumbers(merged.join("\n"));
    } catch (err: any) {
      setError(err?.message ?? "Failed reading CSV file");
    } finally {
      // allow selecting same file twice
      e.target.value = "";
    }
  }

  const connected = status?.connected === true;
  const valid = (results ?? []).filter((r) => r.exists);
  const invalid = (results ?? []).filter((r) => !r.exists);
  const filteredValid = valid.filter((r) =>
    query.trim().length === 0
      ? true
      : r.phone.replace(/\s/g, "").includes(query.replace(/\s/g, ""))
  );
  const filteredInvalid = invalid.filter((r) =>
    query.trim().length === 0
      ? true
      : r.phone.replace(/\s/g, "").includes(query.replace(/\s/g, ""))
  );

  function exportJson(kind: "all" | "valid" | "invalid") {
    if (!results) return;
    const payload =
      kind === "all" ? results : kind === "valid" ? valid : invalid;
    downloadTextFile(
      `wa-checker-${kind}.json`,
      JSON.stringify(payload, null, 2),
      "application/json"
    );
  }

  function exportCsv(kind: "all" | "valid" | "invalid") {
    if (!results) return;
    const payload =
      kind === "all" ? results : kind === "valid" ? valid : invalid;
    const csv = toCsv(
      payload.map((r) => ({ phone: r.phone, exists: r.exists, error: r.error }))
    );
    downloadTextFile(`wa-checker-${kind}.csv`, csv, "text/csv");
  }

  const fadeUp = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0 },
  };

  return (
    <>
      <div className="min-h-screen app-surface p-6">
        <div className="mx-auto max-w-6xl">
          <motion.header
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 flex flex-col gap-3"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-medium tracking-widest text-muted-foreground">
                  WHATSAPP NUMBER CHECKER
                </div>
                <div className="flex flex-row gap-2 justify-center items-center">
                  <img src="logo-alt.svg" className="w-10" />
                  <h1 className="mt-1 text-4xl font-semibold leading-tight text-[#121212]">
                    WAchecker
                  </h1>
                </div>
                <p className="mt-1 text-sm text-[#757575]">
                  Bulk validate numbers locally.
                </p>
              </div>

              <div className="flex items-center gap-2 rounded-full border border-[#E0E0E0] bg-white px-4 py-2 text-sm text-[#121212] card-shadow">
                <span
                  className={cn(
                    "h-2.5 w-2.5 rounded-full",
                    connected
                      ? "bg-[#1A3326]"
                      : status?.status === "connecting"
                      ? "bg-[#D4F65E] animate-pulse"
                      : "bg-rose-500"
                  )}
                />
                <span className="capitalize">
                  {status?.status ?? "unknown"}
                </span>
              </div>
            </div>

            <AnimatePresence>
              {error ? (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
                >
                  {error}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.header>

          <div className="grid gap-5 lg:grid-cols-3">
            {/* Left: connection + input */}
            <div className="space-y-4 lg:col-span-1">
              <motion.div
                variants={fadeUp}
                initial="hidden"
                animate="show"
                transition={{ duration: 0.25 }}
              >
                <Card className="border-[#E0E0E0] bg-white card-shadow">
                  <CardHeader>
                    <CardTitle className="text-[#121212]">Connect</CardTitle>
                    <CardDescription className="text-[#757575]">
                      Scan QR to link your WhatsApp.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <AnimatePresence>
                      {status?.qrCode ? (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.98 }}
                          className="rounded-xl border border-[#E0E0E0] bg-white p-3 card-shadow"
                        >
                          <img
                            className="mx-auto w-[240px] rounded-lg bg-white p-2"
                            src={status.qrCode}
                            alt="QR Code"
                          />
                          <p className="mt-3 text-center text-xs text-[#757575]">
                            WhatsApp → Linked Devices
                          </p>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>

                    {!status?.qrCode && status?.status === "connecting" ? (
                      <div className="rounded-xl border border-[#E0E0E0] bg-white p-4 text-center text-sm text-[#757575] card-shadow">
                        Waiting for QR code
                      </div>
                    ) : null}

                    {!status?.qrCode &&
                    (status?.status === "disconnected" || status == null) ? (
                      <div className="rounded-xl border border-dashed border-[#E0E0E0] bg-white p-4 text-center text-sm text-[#757575]">
                        Click{" "}
                        <span className="font-semibold text-[#1A3326]">
                          Connect
                        </span>{" "}
                        to generate a new QR.
                      </div>
                    ) : null}

                    <div className="flex flex-wrap gap-2">
                      <Button onClick={connect} disabled={busy || connected}>
                        <QrCode size={18} weight="bold" />
                        {busy && !connected
                          ? "Connecting…"
                          : status?.status === "connecting"
                          ? "Retry QR"
                          : "Connect"}
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={disconnect}
                        disabled={busy || !connected}
                      >
                        <XCircle size={18} weight="bold" />
                        Disconnect
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div
                variants={fadeUp}
                initial="hidden"
                animate="show"
                transition={{ duration: 0.25, delay: 0.05 }}
              >
                <Card
                  className={cn(
                    "border-[#E0E0E0] bg-white card-shadow",
                    !connected && "opacity-70"
                  )}
                >
                  <CardHeader>
                    <CardTitle className="text-[#121212]">Input</CardTitle>
                    <CardDescription className="text-[#757575]">
                      Paste or upload CSV (1 number per row).
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Textarea
                      value={numbers}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                        setNumbers(e.target.value)
                      }
                      rows={9}
                      placeholder={"14155552671\n447911123456"}
                      disabled={!connected || busy}
                      className="bg-white text-[#121212] placeholder:text-[#757575]"
                    />

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,text/csv"
                      className="hidden"
                      onChange={onCsvSelected}
                    />

                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        onClick={onPickCsv}
                        disabled={!connected || busy}
                      >
                        <FileCsv size={18} weight="bold" />
                        Upload CSV
                      </Button>
                      <Button
                        onClick={verify}
                        disabled={
                          !connected || busy || numbers.trim().length === 0
                        }
                      >
                        <MagnifyingGlass size={18} weight="bold" />
                        {busy ? "Checking…" : "Verify"}
                      </Button>
                    </div>

                    <AnimatePresence>
                      {busy ? (
                        <motion.div
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 6 }}
                          className="space-y-2"
                        >
                          <div className="flex items-center justify-between text-xs text-[#757575]">
                            <span>{verifyLabel || "Verifying…"}</span>
                            <span>
                              {verifyProgress > 0 ? `${verifyProgress}%` : ""}
                            </span>
                          </div>
                          <Progress
                            value={verifyProgress || 12}
                            className={cn(
                              "bg-[#E0E0E0]",
                              verifyProgress > 0 && verifyProgress < 100 && ""
                            )}
                          />
                        </motion.div>
                      ) : null}
                    </AnimatePresence>

                    <div className="hidden">
                      {/* keeps Input component included for future fields */}
                      <Input />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            {/* Right: results */}
            <div className="lg:col-span-2">
              <motion.div
                variants={fadeUp}
                initial="hidden"
                animate="show"
                transition={{ duration: 0.25, delay: 0.1 }}
              >
                <Card className="border-[#E0E0E0] bg-white card-shadow">
                  <CardHeader>
                    <CardTitle className="text-[#121212]">Results</CardTitle>
                    <CardDescription className="text-[#757575]">
                      View + export valid/invalid lists.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl border border-[#E0E0E0] bg-white p-4 card-shadow">
                        <div className="text-xs text-[#757575]">Total</div>
                        <div className="mt-1 text-2xl font-semibold text-[#121212]">
                          {results ? results.length : "—"}
                        </div>
                      </div>
                      <div className="rounded-xl border border-[#E0E0E0] bg-[#1A3326] p-4 card-shadow">
                        <div className="text-xs text-white/70">Valid</div>
                        <div className="mt-1 text-2xl font-semibold text-white">
                          {results ? valid.length : "—"}
                        </div>
                      </div>
                      <div className="rounded-xl border border-[#E0E0E0] bg-white p-4 card-shadow">
                        <div className="text-xs text-[#757575]">Invalid</div>
                        <div className="mt-1 text-2xl font-semibold text-[#121212]">
                          {results ? invalid.length : "—"}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <Input
                        value={query}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setQuery(e.target.value)
                        }
                        placeholder="Search phone…"
                        className="max-w-sm bg-white text-[#121212] placeholder:text-[#757575]"
                        disabled={!results}
                      />

                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => exportCsv("all")}
                          disabled={!results}
                        >
                          <DownloadSimple size={18} weight="bold" />
                          All CSV
                        </Button>
                      </div>
                    </div>

                    <AnimatePresence>
                      {results ? (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="grid gap-4 lg:grid-cols-2"
                        >
                          <div className="rounded-xl border border-[#E0E0E0] bg-white card-shadow">
                            <div className="flex items-center justify-between gap-3 border-b border-[#E0E0E0] px-4 py-3">
                              <div>
                                <div className="text-sm font-medium text-[#121212]">
                                  Valid
                                </div>
                                <div className="text-xs text-[#757575]">
                                  Registered
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="text-xs text-[#757575]">
                                  {filteredValid.length} shown
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => exportCsv("valid")}
                                  disabled={!results}
                                >
                                  <ArrowDown size={16} weight="bold" />
                                  CSV
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => exportJson("valid")}
                                  disabled={!results}
                                >
                                  <FileText size={16} weight="bold" />
                                  JSON
                                </Button>
                              </div>
                            </div>
                            <div className="max-h-[380px] overflow-auto p-2">
                              {filteredValid.length === 0 ? (
                                <div className="p-4 text-sm text-[#757575]">
                                  No matches.
                                </div>
                              ) : (
                                <div className="grid gap-2">
                                  {filteredValid.map((r) => (
                                    <motion.div
                                      key={r.phone}
                                      initial={{ opacity: 0, y: 6 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      className="flex items-center justify-between rounded-lg border border-[#E0E0E0] bg-white px-3 py-2"
                                    >
                                      <div className="font-mono text-sm text-[#121212]">
                                        {r.phone}
                                      </div>
                                      <div
                                        className="flex items-center gap-1 text-xs font-semibold"
                                        style={{ color: "#1A3326" }}
                                      >
                                        <CheckCircle size={18} weight="fill" />
                                      </div>
                                    </motion.div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="rounded-xl border border-[#E0E0E0] bg-white card-shadow">
                            <div className="flex items-center justify-between gap-3 border-b border-[#E0E0E0] px-4 py-3">
                              <div>
                                <div className="text-sm font-medium text-[#121212]">
                                  Invalid
                                </div>
                                <div className="text-xs text-[#757575]">
                                  Not registered / error
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="text-xs text-[#757575]">
                                  {filteredInvalid.length} shown
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => exportCsv("invalid")}
                                  disabled={!results}
                                >
                                  <ArrowDown size={16} weight="bold" />
                                  CSV
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => exportJson("invalid")}
                                  disabled={!results}
                                >
                                  <FileText size={16} weight="bold" />
                                  JSON
                                </Button>
                              </div>
                            </div>
                            <div className="max-h-[380px] overflow-auto p-2">
                              {filteredInvalid.length === 0 ? (
                                <div className="p-4 text-sm text-[#757575]">
                                  No matches.
                                </div>
                              ) : (
                                <div className="grid gap-2">
                                  {filteredInvalid.map((r) => (
                                    <motion.div
                                      key={r.phone}
                                      initial={{ opacity: 0, y: 6 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      className="flex items-center justify-between rounded-lg border border-[#E0E0E0] bg-white px-3 py-2"
                                    >
                                      <div>
                                        <div className="font-mono text-sm text-[#121212]">
                                          {r.phone}
                                        </div>
                                        {r.error ? (
                                          <div className="mt-0.5 text-xs text-[#757575]">
                                            {r.error}
                                          </div>
                                        ) : null}
                                      </div>
                                      <div className="text-rose-600">
                                        <XCircle size={18} weight="fill" />
                                      </div>
                                    </motion.div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="rounded-xl border border-dashed border-[#E0E0E0] bg-white p-10 text-center"
                        >
                          <div className="text-sm text-[#757575]">
                            No results yet.
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute bottom-0 w-full bg-[#123F30] p-3 flex justify-between">
        <div className="flex flex-col">
          <p className="text-white italic text-sm">Unreleased Internal Tool</p>
          <p className="text-[#BCFF78] text-xs font-semibold">Use with caution</p>
        </div>
        <img src="wordmark.svg" className="w-[170px]" />
      </div>
    </>
  );
}
