"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    PlayCircle, ShieldAlert, CopyCheck, AlertTriangle,
    Upload, Download, Users, CheckCircle2, Clock, Cpu, ChevronDown
} from "lucide-react";
import { uploadDataset, testDataset, fetchTrainingStatus, TrainingStatus, fetchVersions, ModelVersion } from "@/lib/api";

interface ClientUpdate {
    client_id: string;
    status: string;
    norm_value: number | null;
    distance_value: number | null;
    reason: string;
    created_at?: string;
}

export default function ClientsPage() {
    // ── Simulation state ──────────────────────────────────────────────────────
    const [simName, setSimName] = useState("");
    const [isMalicious, setIsMalicious] = useState(false);
    const [isSimulating, setIsSimulating] = useState(false);
    const [simMessage, setSimMessage] = useState<{ type: "ok" | "err" | "info"; msg: string } | null>(null);

    // ── Client stream state ───────────────────────────────────────────────────
    const [clientUpdates, setClientUpdates] = useState<ClientUpdate[]>([]);
    const [loading, setLoading] = useState(true);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ── Submit Training state ─────────────────────────────────────────────────
    const [trainClientId, setTrainClientId] = useState("");
    const [trainFile, setTrainFile] = useState<File | null>(null);
    const [trainEpochs, setTrainEpochs] = useState(3);
    const [isTraining, setIsTraining] = useState(false);
    const [trainMsg, setTrainMsg] = useState<{ type: "ok" | "err" | "info"; msg: string } | null>(null);
    const [trainingStatus, setTrainingStatus] = useState<TrainingStatus | null>(null);
    const [modelVersions, setModelVersions] = useState<ModelVersion[]>([]);
    const [selectedVersionId, setSelectedVersionId] = useState<string>("");
    const [isTestingDataset, setIsTestingDataset] = useState(false);
    const [isDatasetValid, setIsDatasetValid] = useState(false);
    const [testResult, setTestResult] = useState<{ valid: boolean; topic: string; msg: string } | null>(null);
    const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ── Init ──────────────────────────────────────────────────────────────────
    useEffect(() => {
        const loadInitialData = async () => {
            const versions = await fetchVersions();
            if (versions && versions.length > 0) {
                setModelVersions(versions);
                setSelectedVersionId(String(versions[0].id));
            }
        };
        loadInitialData();

        const stored = localStorage.getItem("user");
        let name = `EdgeNode-${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`;
        if (stored) {
            try {
                const u = JSON.parse(stored);
                if (u?.name) name = u.name;
            } catch { /* ignore */ }
        }
        setSimName(name);
        setTrainClientId(name);

        fetchClientUpdates();
        pollRef.current = setInterval(fetchClientUpdates, 3000);
        refreshTrainingStatus();
        statusPollRef.current = setInterval(refreshTrainingStatus, 3000);

        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
            if (statusPollRef.current) clearInterval(statusPollRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── File parsed effect for default epochs ──────────────────────────────────
    useEffect(() => {
        if (!trainFile) return;

        // Auto-detect number of lines in the CSV to use as default epochs
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            if (text) {
                // Split by newline and filter out empty lines
                const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
                // Subtract 1 for the header row, clamping between 1 and 100,000
                const numDataRows = Math.max(1, Math.min(100000, lines.length - 1));
                setTrainEpochs(numDataRows);
                setTrainMsg({ type: "info", msg: `Detected ${numDataRows} data rows in the file. Defaulting to ${numDataRows} epochs.` });
            }
        };
        reader.readAsText(trainFile);
    }, [trainFile]);

    const fetchClientUpdates = async () => {
        try {
            const res = await fetch("http://localhost:8000/fl/clients");
            if (res.ok) {
                const json = await res.json();
                setClientUpdates(json.data || []);
            }
        } catch { /* ignore */ } finally {
            setLoading(false);
        }
    };

    const refreshTrainingStatus = useCallback(async () => {
        const s = await fetchTrainingStatus();
        if (s) setTrainingStatus(s);
    }, []);

    // ── Simulation handler ────────────────────────────────────────────────────
    const handleSimulate = async () => {
        setIsSimulating(true);
        setSimMessage({ type: "info", msg: "Firing simulation..." });
        try {
            const res = await fetch("http://localhost:8000/fl/simulate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ client_name: simName, is_malicious: isMalicious, malicious_multiplier: 50.0 }),
            });
            if (res.ok) {
                setSimMessage({ type: "ok", msg: "Simulation started! Client data will appear below shortly." });
            } else if (res.status === 503) {
                setSimMessage({ type: "err", msg: "No model loaded yet — upload a CSV dataset on the Overview page first." });
            } else {
                const j = await res.json().catch(() => ({}));
                setSimMessage({ type: "err", msg: j.detail || "Simulation request failed." });
            }
        } catch {
            setSimMessage({ type: "err", msg: "Network error — is the backend running on port 8000?" });
        } finally {
            setIsSimulating(false);
        }
    };

    const handleTestData = async () => {
        if (!trainFile) {
            setTrainMsg({ type: "err", msg: "Please select a CSV file first." });
            return;
        }
        setIsTestingDataset(true);
        setTestResult(null);
        setTrainMsg(null);
        try {
            const res = await testDataset(trainFile);
            if (res) {
                setTestResult({
                    valid: res.valid,
                    topic: res.detected_topic,
                    msg: res.message
                });
                setIsDatasetValid(res.valid);
                if (res.valid) {
                    setTrainMsg({ type: "ok", msg: "Dataset validated successfully! You can now submit your weights." });
                } else {
                    setTrainMsg({ type: "err", msg: `Validation Failed: ${res.message}` });
                }
            } else {
                setTrainMsg({ type: "err", msg: "Test request failed -- backend might be down." });
            }
        } catch {
            setTrainMsg({ type: "err", msg: "Network error during dataset testing." });
        } finally {
            setIsTestingDataset(false);
        }
    };

    // ── Training upload handler ───────────────────────────────────────────────
    const handleTrainSubmit = async () => {
        if (!trainFile) {
            setTrainMsg({ type: "err", msg: "Please select a CSV file first." });
            return;
        }
        if (!trainClientId.trim()) {
            setTrainMsg({ type: "err", msg: "Please enter your client ID." });
            return;
        }
        if (!selectedVersionId) {
            setTrainMsg({ type: "err", msg: "Please select a base model version." });
            return;
        }
        setIsTraining(true);
        setTrainMsg({ type: "info", msg: `Uploading dataset and fine-tuning version ${selectedVersionId} for ${trainEpochs} epoch(s)…` });
        try {
            const result = await uploadDataset(trainClientId.trim(), trainFile, trainEpochs, selectedVersionId);
            if (result) {
                setTrainMsg({
                    type: "ok",
                    msg: `✅ Training started (${result.epochs} epoch(s))! Once ${trainingStatus?.required_count ?? 1} client(s) submit, a new model version will be created.`,
                });
                setTrainFile(null);
                setTrainEpochs(3); // Reset to a safe default
                // Reset file input
                const fi = document.getElementById("trainFileInput") as HTMLInputElement | null;
                if (fi) fi.value = "";
                // Fast-poll for status
                refreshTrainingStatus();
            } else {
                setTrainMsg({ type: "err", msg: "Upload failed — check that a model is loaded (run a simulation first) and the backend is running." });
            }
        } catch {
            setTrainMsg({ type: "err", msg: "Network error during upload." });
        } finally {
            setIsTraining(false);
        }
    };

    // ── Derived progress ──────────────────────────────────────────────────────
    const progressPct = trainingStatus
        ? Math.min(100, Math.round((trainingStatus.pending_count / Math.max(trainingStatus.required_count, 1)) * 100))
        : 0;

    return (
        <div className="flex flex-col gap-8 pb-10">
            {/* Header */}
            <div className="flex flex-col gap-2">
                <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Edge Clients &amp; Tokens</h2>
                <p className="text-slate-500">Manage connected nodes, submit training datasets, and monitor SLT Token rewards.</p>
            </div>

            {/* ── Submit Training Round ─────────────────────────────────────────── */}
            <Card className="border-0 shadow-xl overflow-hidden bg-gradient-to-br from-emerald-950 via-teal-950 to-slate-950 relative">
                {/* decorative glows */}
                <div className="absolute -top-20 -left-20 w-72 h-72 bg-emerald-500/20 blur-3xl rounded-full pointer-events-none" />
                <div className="absolute -bottom-20 -right-10 w-64 h-64 bg-teal-500/15 blur-3xl rounded-full pointer-events-none" />

                <CardHeader className="relative z-10">
                    <CardTitle className="text-xl font-bold text-emerald-100 flex items-center gap-2">
                        <Cpu className="w-5 h-5 text-emerald-400" />
                        Submit Training Round
                    </CardTitle>
                    <p className="text-emerald-200/60 text-sm max-w-3xl mt-1">
                        Download the current global model, train it on your own CSV dataset locally, then submit the updated weights.
                        Once the required number of clients submit, the server <span className="text-emerald-300 font-semibold">auto-aggregates and creates a new model version</span>.
                    </p>
                </CardHeader>

                <CardContent className="relative z-10">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                        {/* ── Left: Upload form ─────────────────────────────── */}
                        <div className="flex flex-col gap-4">
                            {/* Step 1: Base Model Selection */}
                            <div className="flex flex-col gap-1">
                                <span className="text-xs text-emerald-400 font-bold uppercase tracking-widest">Step 1 — Select Base Model to Fine-Tune</span>
                                <div className="relative">
                                    <select
                                        className="appearance-none bg-emerald-900/40 border border-emerald-700/40 text-white px-4 py-2.5 pr-10 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 font-mono text-sm transition-all w-full md:w-fit"
                                        value={selectedVersionId}
                                        onChange={(e) => setSelectedVersionId(e.target.value)}
                                        disabled={modelVersions.length === 0}
                                    >
                                        {modelVersions.length === 0 ? (
                                            <option value="">No models available</option>
                                        ) : (
                                            modelVersions.map(mv => (
                                                <option key={mv.id} value={mv.id}>
                                                    v{mv.version_num} (Round {mv.global_round}) — {new Date(mv.created_at).toLocaleDateString()}
                                                </option>
                                            ))
                                        )}
                                    </select>
                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500 pointer-events-none" />
                                </div>
                            </div>

                            {/* Step 2: Your identity */}
                            <div className="flex flex-col gap-1">
                                <span className="text-xs text-emerald-400 font-bold uppercase tracking-widest">Step 2 — Your Client ID</span>
                                <input
                                    className="bg-emerald-900/40 border border-emerald-700/40 text-white px-4 py-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 placeholder:text-emerald-700 font-mono text-sm transition-all w-full"
                                    value={trainClientId}
                                    onChange={(e) => setTrainClientId(e.target.value)}
                                    placeholder="e.g. Alice"
                                />
                            </div>

                            {/* Step 3: CSV + epochs */}
                            <div className="flex flex-col gap-1">
                                <span className="text-xs text-emerald-400 font-bold uppercase tracking-widest">Step 3 — Upload Your Dataset &amp; Set Epochs</span>
                                <input
                                    id="trainFileInput"
                                    type="file"
                                    accept=".csv"
                                    onChange={(e) => setTrainFile(e.target.files?.[0] ?? null)}
                                    className="file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border-0 file:bg-emerald-700 file:text-white file:text-xs file:font-semibold hover:file:bg-emerald-600 text-emerald-200 text-sm bg-emerald-900/40 border border-emerald-700/40 rounded-lg px-3 py-1.5 transition-all w-full cursor-pointer"
                                />
                                {trainFile && (
                                    <span className="text-xs text-emerald-400 mt-0.5 truncate">📎 {trainFile.name}</span>
                                )}

                                {/* Epoch input */}
                                <div className="mt-2 flex flex-col gap-1">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-xs text-emerald-400 font-bold uppercase tracking-widest">Training Epochs</span>
                                        <input
                                            type="number"
                                            min={1}
                                            max={100000}
                                            value={trainEpochs}
                                            onChange={(e) => setTrainEpochs(Number(e.target.value))}
                                            className="bg-emerald-900/40 border border-emerald-700/40 text-white px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 font-mono text-sm transition-all w-32"
                                        />
                                    </div>
                                    <div className="text-[10px] text-emerald-700 font-mono">Min 1, max 100,000</div>
                                </div>
                            </div>

                            {/* Validation and Submit buttons */}
                            <div className="flex flex-col gap-2 mt-2">
                                <div className="flex flex-wrap gap-3">
                                    <button
                                        onClick={handleTestData}
                                        disabled={isTestingDataset || !trainFile}
                                        className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm shadow-lg transition-all
                                            ${isTestingDataset || !trainFile
                                                ? "bg-blue-900/40 text-blue-600 cursor-not-allowed border border-blue-800/40"
                                                : "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/50 active:scale-[0.98]"
                                            }`}
                                    >
                                        {isTestingDataset ? (
                                            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                            </svg>
                                        ) : (
                                            <CopyCheck className="w-4 h-4" />
                                        )}
                                        {isTestingDataset ? "Verifying..." : "Test Dataset"}
                                    </button>

                                    <button
                                        onClick={handleTrainSubmit}
                                        disabled={isTraining || !trainFile || !isDatasetValid}
                                        className={`flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm shadow-lg transition-all
                                            ${isTraining || !trainFile || !isDatasetValid
                                                ? "bg-emerald-900/40 text-emerald-600 cursor-not-allowed border border-emerald-800/40"
                                                : "bg-emerald-500 hover:bg-emerald-400 text-white shadow-emerald-900/50 active:scale-[0.98]"
                                            }`}
                                    >
                                        <Upload className={`w-4 h-4 ${isTraining ? "animate-bounce" : ""}`} />
                                        {isTraining ? "Training..." : "Train & Submit Weights"}
                                    </button>
                                </div>

                                {/* Validation Results */}
                                {testResult && (
                                    <div className={`p-3 rounded-lg border flex flex-col gap-1 transition-all animate-in fade-in slide-in-from-top-1
                                        ${testResult.valid ? "bg-emerald-900/20 border-emerald-500/30" : "bg-red-900/20 border-red-500/30"}`}>
                                        <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider">
                                            {testResult.valid ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-red-400" />}
                                            <span className={testResult.valid ? "text-emerald-400" : "text-red-400"}>
                                                Dataset Topic Validated: {testResult.topic}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-300 ml-6">{testResult.msg}</p>
                                    </div>
                                )}
                            </div>

                            {/* Training message */}
                            {trainMsg && (
                                <div className={`px-4 py-3 rounded-lg text-sm font-medium border flex items-start gap-2 ${trainMsg.type === "ok"
                                    ? "bg-green-950/40 text-green-300 border-green-800/40"
                                    : trainMsg.type === "err"
                                        ? "bg-red-950/40 text-red-300 border-red-800/40"
                                        : "bg-teal-950/40 text-teal-300 border-teal-800/40"
                                    }`}>
                                    {trainMsg.type === "info" && (
                                        <svg className="animate-spin h-4 w-4 shrink-0 mt-0.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                        </svg>
                                    )}
                                    <span>{trainMsg.msg}</span>
                                </div>
                            )}
                        </div>

                        {/* ── Right: Round progress ─────────────────────────── */}
                        <div className="flex flex-col gap-4 lg:border-l lg:border-emerald-800/30 lg:pl-6">
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-emerald-400 font-bold uppercase tracking-widest">Round Progress</span>
                                {trainingStatus && (
                                    <span className="text-xs bg-emerald-900/50 text-emerald-300 border border-emerald-700/40 px-2.5 py-1 rounded-full font-mono">
                                        v{trainingStatus.current_version} → v{trainingStatus.current_version + 1}
                                    </span>
                                )}
                            </div>

                            {/* Counter */}
                            <div className="bg-emerald-900/30 border border-emerald-800/30 rounded-xl p-5 flex flex-col gap-3">
                                <div className="flex items-end justify-between">
                                    <div>
                                        <span className="text-5xl font-black text-emerald-300 tabular-nums">
                                            {trainingStatus?.pending_count ?? 0}
                                        </span>
                                        <span className="text-emerald-600 text-xl font-bold">/{trainingStatus?.required_count ?? 1}</span>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xs text-emerald-500 font-semibold uppercase">Clients Submitted</div>
                                        <div className="text-xs text-emerald-600 mt-0.5">
                                            {trainingStatus?.required_count
                                                ? Math.max(0, trainingStatus.required_count - trainingStatus.pending_count)
                                                : 1} more needed
                                        </div>
                                    </div>
                                </div>

                                {/* Progress bar */}
                                <div className="w-full h-2.5 bg-emerald-950/60 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
                                        style={{ width: `${progressPct}%` }}
                                    />
                                </div>

                                {/* Status pill */}
                                <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold w-fit border
                                    ${trainingStatus?.round_active
                                        ? "bg-emerald-900/40 text-emerald-300 border-emerald-700/40"
                                        : "bg-slate-900/40 text-slate-400 border-slate-700/40"
                                    }`}>
                                    {trainingStatus?.round_active
                                        ? <><CheckCircle2 className="w-3 h-3" /> Model Loaded — Ready to Receive Updates</>
                                        : <><Clock className="w-3 h-3" /> No model loaded yet — upload a dataset first</>
                                    }
                                </div>
                            </div>

                            {/* Pending client list */}
                            {trainingStatus && trainingStatus.pending_clients.length > 0 && (
                                <div className="flex flex-col gap-2">
                                    <span className="text-xs text-emerald-500 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                                        <Users className="w-3.5 h-3.5" /> Clients In Queue
                                    </span>
                                    <div className="flex flex-wrap gap-2">
                                        {trainingStatus.pending_clients.map((cid, i) => (
                                            <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-teal-900/50 text-teal-200 border border-teal-700/40">
                                                <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
                                                {cid}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* How it works */}
                            <div className="mt-auto bg-emerald-900/20 border border-emerald-800/20 rounded-lg p-3 text-xs text-emerald-400/70 leading-relaxed">
                                <span className="text-emerald-300 font-semibold block mb-1">How it works</span>
                                Each client trains locally on their own data (no raw data is shared).
                                The server aggregates weight updates using <span className="text-emerald-300">FedAvg</span> with Byzantine-rejection.
                                A new global version is published after <span className="text-emerald-300">{trainingStatus?.required_count ?? 1} client(s)</span> submit.
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* ── Simulation Controller ─────────────────────────────────────────── */}
            <Card className="bg-indigo-950 border-indigo-900 shadow-xl shadow-indigo-900/10 overflow-hidden relative">
                <div className="absolute -top-24 -right-24 w-96 h-96 bg-indigo-500/20 blur-3xl rounded-full pointer-events-none" />
                <CardHeader>
                    <CardTitle className="text-xl font-bold text-indigo-100 flex items-center gap-2">
                        <ShieldAlert className="w-5 h-5 text-indigo-400" />
                        Simulation Controller
                    </CardTitle>
                    <p className="text-indigo-200/70 text-sm max-w-2xl mt-1">
                        Inject authentic edge client training updates directly into the FastAPI endpoint.
                        Malicious clients apply harsh noise to test Byzantine defenses.
                    </p>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-4 items-end relative z-10">
                        <div className="flex flex-col gap-2">
                            <label className="text-xs text-indigo-300 font-semibold uppercase tracking-wider">Client Node ID</label>
                            <input
                                className="bg-indigo-900/50 border border-indigo-700/50 text-white px-4 py-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 w-64 placeholder:text-indigo-700 transition-all font-mono text-sm"
                                value={simName}
                                onChange={(e) => setSimName(e.target.value)}
                                placeholder="e.g. EdgeNode-139"
                            />
                        </div>
                        <div className="flex items-center gap-3 bg-indigo-900/30 border border-indigo-800/50 px-5 py-2.5 rounded-lg h-[42px]">
                            <input
                                type="checkbox"
                                id="maliciousToggle"
                                checked={isMalicious}
                                onChange={(e) => setIsMalicious(e.target.checked)}
                                className="w-4 h-4 rounded border-indigo-700 text-red-500 focus:ring-red-500 bg-indigo-950 cursor-pointer accent-red-500"
                            />
                            <label htmlFor="maliciousToggle" className={`text-sm font-medium cursor-pointer transition-colors ${isMalicious ? "text-red-400" : "text-indigo-300 hover:text-indigo-200"}`}>
                                Inject Byzantine Data Poisoning
                            </label>
                        </div>
                        <button
                            onClick={handleSimulate}
                            disabled={isSimulating}
                            className={`transition-all px-6 py-2.5 rounded-lg font-semibold flex items-center gap-2 shadow-lg h-[42px] ${isMalicious
                                ? "bg-red-600 hover:bg-red-700 text-white shadow-red-900/50"
                                : "bg-indigo-500 hover:bg-indigo-600 text-white shadow-indigo-900/50"
                                } ${isSimulating ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                            <PlayCircle className={`w-5 h-5 ${isSimulating ? "animate-spin" : ""}`} />
                            {isSimulating ? "Simulating..." : isMalicious ? "Fire Malicious Payload" : "Fire Normal Update"}
                        </button>
                    </div>
                    {simMessage && (
                        <div className={`mt-4 px-4 py-3 rounded-lg text-sm font-medium border flex items-center gap-2 ${simMessage.type === "ok" ? "bg-green-950/40 text-green-300 border-green-800/40"
                            : simMessage.type === "err" ? "bg-red-950/40 text-red-300 border-red-800/40"
                                : "bg-indigo-950/40 text-indigo-300 border-indigo-800/40"
                            }`}>
                            {simMessage.type === "info" && (
                                <svg className="animate-spin h-4 w-4 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                </svg>
                            )}
                            {simMessage.msg}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ── Live Client Update Stream ─────────────────────────────────────── */}
            <Card className="bg-white border-slate-200 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-lg font-bold text-slate-900">Live Client Update Stream</CardTitle>
                    {clientUpdates.length > 0 && (
                        <span className="text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-full">
                            {clientUpdates.length} update{clientUpdates.length !== 1 ? "s" : ""}
                        </span>
                    )}
                </CardHeader>
                <CardContent>
                    <div className="w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50/50">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-100/50 text-slate-500 uppercase text-xs">
                                <tr>
                                    <th className="px-6 py-3 font-semibold">Client ID</th>
                                    <th className="px-6 py-3 font-semibold">Defense Status</th>
                                    <th className="px-6 py-3 font-semibold">L2 Norm / Distance</th>
                                    <th className="px-6 py-3 font-semibold text-right">Blockchain Incentive</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {loading ? (
                                    <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-400 animate-pulse">Loading…</td></tr>
                                ) : clientUpdates.length > 0 ? clientUpdates.map((row, i) => (
                                    <tr key={i} className="bg-white hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4 font-mono text-slate-700 text-xs font-semibold">{row.client_id}</td>
                                        <td className="px-6 py-4">
                                            {row.status === "ACCEPT" ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                                                    <CopyCheck className="w-3.5 h-3.5" /> Validated
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200" title={row.reason}>
                                                    <AlertTriangle className="w-3.5 h-3.5" /> Rejected
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-slate-500 font-mono text-xs">
                                            {row.norm_value ? row.norm_value.toFixed(2) : "-"} / {row.distance_value ? row.distance_value.toFixed(2) : "-"}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {row.status === "ACCEPT"
                                                ? <span className="font-bold text-green-600">+10 FLT</span>
                                                : <span className="font-bold text-red-600">-15 FLT (Slashed)</span>
                                            }
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                                            No client runs detected. Submit training weights above or fire a simulation!
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
