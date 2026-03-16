"use client";
import React, { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BorderBeam } from "@/components/ui/border-beam";
import {
    Activity, Network, ShieldCheck, Cpu, ArrowUpRight, CopyCheck,
    AlertTriangle, TrendingDown, TrendingUp, Zap, Clock, CheckCircle2, Wallet, FileText
} from "lucide-react";
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Legend, Area, ComposedChart, Bar
} from "recharts";
import { fetchMetrics, MetricsResponse } from "@/lib/api";

interface MetricsData {
    current_version: number;
    evaluations: any[];
    aggregations: any[];
    pending_queue_size: number;
}

interface BlockchainData {
    wallets: any[];
    recent_transactions: any[];
}

export default function OverviewPage() {
    const [data, setData] = useState<MetricsData | null>(null);
    const [blockchainData, setBlockchainData] = useState<BlockchainData | null>(null);
    const [loading, setLoading] = useState(true);
    // Upload section state
    const [uploadClientId, setUploadClientId] = useState("");
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [datasetUrl, setDatasetUrl] = useState("");
    const [isUploading, setIsUploading] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<{ type: "success" | "error" | "info"; msg: string } | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [isTraining, setIsTraining] = useState(false);
    const [chartFlash, setChartFlash] = useState(false);
    const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const prevEvalCountRef = useRef<number>(0);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const loadMetrics = async () => {
        try {
            const json = await fetchMetrics();
            if (json) {
                json.evaluations = [...json.evaluations].reverse();
                json.aggregations = [...json.aggregations].reverse();
                setData(json as MetricsData);
            }

            // Poll Blockchain Economy
            const bcRes = await fetch("http://localhost:8000/fl/blockchain/status");
            if (bcRes.ok) {
                const bcJson = await bcRes.json();
                setBlockchainData(bcJson);
            }

            setLastUpdated(new Date());
        } catch (e) {
            console.error("Failed fetching metrics", e);
        } finally {
            setLoading(false);
        }
    };

    // ── Polling logic ───────────────────────────────────────────────────────
    const startPolling = (intervalMs: number, durationMs?: number) => {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = setInterval(loadMetrics, intervalMs);
        if (durationMs) {
            setTimeout(() => {
                if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = setInterval(loadMetrics, 3000);
            }, durationMs);
        }
    };

    useEffect(() => {
        const stored = localStorage.getItem("user");
        if (stored) {
            try {
                const userObj = JSON.parse(stored);
                if (userObj && userObj.name) {
                    setUploadClientId(userObj.name);
                }
            } catch (e) {
                console.error("Failed to parse user session", e);
            }
        }

        loadMetrics();
        startPolling(3000);
        return () => { if (pollIntervalRef.current) clearInterval(pollIntervalRef.current); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Detect when new evaluation data arrives after a training run
    useEffect(() => {
        const currentCount = data?.evaluations?.length ?? 0;
        if (isTraining && currentCount > prevEvalCountRef.current) {
            setIsTraining(false);
            setChartFlash(true);
            setTimeout(() => setChartFlash(false), 2000);
        }
        prevEvalCountRef.current = currentCount;
    }, [data, isTraining]);


    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setSelectedFile(e.target.files[0]);
        }
    };

    const handleDatasetUpload = async () => {
        if (!uploadClientId || (!selectedFile && !datasetUrl)) {
            setUploadStatus({ type: "error", msg: "Please provide a Client ID and either a dataset file or URL." });
            return;
        }

        setIsUploading(true);
        setUploadStatus({ type: "info", msg: "Uploading and starting training..." });

        const formData = new FormData();
        formData.append("client_id", uploadClientId);
        if (selectedFile) formData.append("file", selectedFile);
        if (datasetUrl) formData.append("dataset_url", datasetUrl);

        try {
            const res = await fetch("http://localhost:8000/fl/api/dataset/upload", {
                method: "POST",
                body: formData,
            });

            if (res.ok) {
                setUploadStatus({ type: "success", msg: "Dataset uploaded! Background training started — charts will update shortly." });
                setIsTraining(true);
                prevEvalCountRef.current = data?.evaluations?.length ?? 0;
                // Fast-poll every 1s for 45s so charts update as soon as training finishes
                startPolling(1000, 45000);
                if (fileInputRef.current) fileInputRef.current.value = "";
                setSelectedFile(null);
                setDatasetUrl("");
            } else {
                const data = await res.json().catch(() => ({}));
                setUploadStatus({ type: "error", msg: data.detail || "Failed to upload dataset." });
            }
        } catch (e) {
            setUploadStatus({ type: "error", msg: "Network error occurred." });
        } finally {
            setIsUploading(false);
        }
    };

    const handleFetchWeights = async () => {
        if (!uploadClientId) {
            setUploadStatus({ type: "error", msg: "Please enter the Client ID to fetch weights." });
            return;
        }

        try {
            setUploadStatus({ type: "info", msg: "Checking weights..." });
            const res = await fetch(`http://localhost:8000/fl/api/model/weights/${uploadClientId}`);
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setUploadStatus({
                    type: "error",
                    msg: data.detail || "Weights not found. Training may still be in progress."
                });
                return;
            }

            // If ok, trigger file download natively
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `weights_${uploadClientId}.pt`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);

            setUploadStatus({ type: "success", msg: "Weights downloaded successfully!" });
        } catch (e) {
            setUploadStatus({ type: "error", msg: "Network error occurred." });
        }
    };

    const calculateTotalClients = () => {
        if (!data?.aggregations) return { acc: 0, rej: 0 };
        let acc = 0, rej = 0;
        data.aggregations.forEach(a => { acc += a.total_accepted; rej += a.total_rejected; });
        return { acc, rej };
    };

    const stats = calculateTotalClients();
    const latestEval = data?.evaluations?.length ? data.evaluations[data.evaluations.length - 1] : null;
    const prevEval = data?.evaluations?.length && data.evaluations.length > 1 ? data.evaluations[data.evaluations.length - 2] : null;
    const latestAgg = data?.aggregations?.length ? data.aggregations[data.aggregations.length - 1] : null;

    const accDelta = latestEval?.accuracy != null && prevEval?.accuracy != null
        ? ((latestEval.accuracy - prevEval.accuracy) * 100) : null;
    const lossDelta = latestEval?.loss != null && prevEval?.loss != null
        ? (latestEval.loss - prevEval.loss) : null;

    const kpis = [
        { title: "Model Version", value: `v${data?.current_version || 0}`, icon: Network, trend: "Live Synced" },
        { title: "Aggregation Method", value: latestAgg?.method || "—", icon: Cpu, trend: "DP layer active" },
        { title: "Accepted Updates", value: stats.acc.toString(), icon: Activity, trend: `Queue: ${data?.pending_queue_size || 0} pending` },
        { title: "Blocked / Rejected", value: stats.rej.toString(), icon: ShieldCheck, trend: "Byzantine payloads blocked", highlight: true },
        { title: "Latest Accuracy", value: latestEval?.accuracy != null ? `${(latestEval.accuracy * 100).toFixed(2)}%` : "N/A", icon: CopyCheck, trend: accDelta !== null ? `${accDelta >= 0 ? "↑" : "↓"} ${Math.abs(accDelta).toFixed(2)}% this round` : "Awaiting data", highlightKey: true },
    ];

    // Combined chart: loss + accuracy on dual axes
    const combinedChartData = (data?.evaluations ?? [])
        .filter(e => e.accuracy != null || e.loss != null)
        .map(e => ({
            version: `v${e.version_id}`,
            accuracy: e.accuracy != null ? parseFloat((e.accuracy * 100).toFixed(2)) : null,
            loss: e.loss != null ? parseFloat((e.loss).toFixed(4)) : null,
        }));

    // Client acceptance rate per round
    const acceptanceData = (data?.aggregations ?? []).map(a => ({
        round: `v${a.version_id}`,
        accepted: a.total_accepted,
        rejected: a.total_rejected,
    }));

    // ── Real-Time Insights ─────────────────────────────────────────────────
    // Always derives at least 2-3 signals from whatever data is available.
    // Signals that require evaluation data are only shown when evals exist.
    // Signals from aggregation + queue + version are always shown.
    const insights: { icon: any; color: string; label: string; detail: string; type: "ok" | "warn" | "info" }[] = [];

    // Server connectivity
    if (!data && !loading) {
        insights.push({ icon: AlertTriangle, color: "text-red-500", label: "Cannot Reach Backend", detail: "Check that uvicorn is running on port 8000 and /fl mount is active.", type: "warn" });
    }

    // ── Signals from evaluation data (only when available) ──
    if (latestEval) {
        const acc = latestEval.accuracy * 100;
        if (acc >= 80) {
            insights.push({ icon: CheckCircle2, color: "text-green-500", label: "Model Converging Well", detail: `${acc.toFixed(1)}% accuracy on validation set`, type: "ok" });
        } else if (acc >= 50) {
            insights.push({ icon: TrendingUp, color: "text-yellow-500", label: "Model Still Learning", detail: `${acc.toFixed(1)}% — more training rounds recommended`, type: "warn" });
        } else {
            insights.push({ icon: AlertTriangle, color: "text-red-500", label: "Underfitting Detected", detail: `Only ${acc.toFixed(1)}% accuracy — check dataset balance`, type: "warn" });
        }
        if (lossDelta !== null) {
            if (lossDelta < 0) {
                insights.push({ icon: TrendingDown, color: "text-green-500", label: "Loss Decreasing", detail: `Δ loss = ${lossDelta.toFixed(4)} — healthy gradient descent`, type: "ok" });
            } else if (lossDelta > 0.5) {
                insights.push({ icon: AlertTriangle, color: "text-red-500", label: "Loss Spiked", detail: `Δ loss = +${lossDelta.toFixed(4)} — possible poisoning or divergence`, type: "warn" });
            } else {
                insights.push({ icon: TrendingUp, color: "text-yellow-500", label: "Loss Stable / Plateauing", detail: `Δ loss = +${lossDelta.toFixed(4)} — consider adjusting learning rate`, type: "info" });
            }
        }
    } else if (data) {
        // No eval data yet — show a prompt insight
        insights.push({ icon: Zap, color: "text-slate-400", label: "No Evaluation Data Yet", detail: "Upload a CSV dataset to generate accuracy & loss metrics for this panel.", type: "info" });
    }

    // ── Signals always derived from aggregation data ──
    if (data) {
        const rounds = data.aggregations?.length ?? 0;
        const version = data.current_version ?? 0;

        if (rounds > 0) {
            insights.push({
                icon: CheckCircle2, color: "text-indigo-500", label: `${rounds} Aggregation Round${rounds > 1 ? "s" : ""} Complete`,
                detail: `Global model is at version v${version} — ${rounds} round${rounds > 1 ? "s" : ""} of federated averaging completed`,
                type: "ok"
            });
        } else {
            insights.push({
                icon: Zap, color: "text-slate-400", label: "Awaiting First Round",
                detail: "No aggregation runs yet. Fire a simulation or upload a dataset to start training.",
                type: "info"
            });
        }

        // Byzantine defense status — derived from acceptance counts
        if (stats.rej > 0) {
            const rejectRate = stats.acc > 0 ? ((stats.rej / (stats.acc + stats.rej)) * 100).toFixed(1) : "100";
            insights.push({
                icon: ShieldCheck, color: "text-indigo-500", label: "Byzantine Defense Active",
                detail: `${rejectRate}% of updates blocked by L2 anomaly detector (${stats.rej} rejected out of ${stats.acc + stats.rej} total)`,
                type: "info"
            });
        } else if (stats.acc > 0) {
            insights.push({
                icon: ShieldCheck, color: "text-green-500", label: "All Updates Passed Defense",
                detail: `${stats.acc} update${stats.acc > 1 ? "s" : ""} accepted with clean L2 norm & distance — no Byzantine anomaly detected`,
                type: "ok"
            });
        }

        // Queue status
        if (data.pending_queue_size > 0) {
            insights.push({
                icon: Clock, color: "text-blue-500", label: "Aggregation Queued",
                detail: `${data.pending_queue_size} update${data.pending_queue_size > 1 ? "s" : ""} pending — aggregation will trigger when MIN_AGGREGATE_SIZE is reached`,
                type: "info"
            });
        }
    }


    // Activity feed
    const activityFeed: any[] = [];
    if (data?.aggregations) {
        [...data.aggregations].reverse().slice(0, 5).forEach((agg: any) => {
            activityFeed.push({
                event: "Global Model Updated",
                details: `v${agg.version_id} via ${agg.method} — ${agg.total_accepted} valid, ${agg.total_rejected} blocked`,
                status: "Success",
                time: agg.created_at ? new Date(agg.created_at).toLocaleTimeString() : `Round ${agg.version_id}`
            });
        });
    }

    return (
        <div className="flex flex-col gap-8 pb-10">
            <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                    <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Global System Overview</h2>
                    <p className="text-slate-500 text-sm">
                        Real-time federated learning metrics.
                        {lastUpdated && <span className="ml-2 text-slate-400">Last updated: {lastUpdated.toLocaleTimeString()}</span>}
                    </p>
                </div>
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${data ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                    <span className={`w-2 h-2 rounded-full ${data ? "bg-green-400 animate-pulse" : "bg-red-400"}`} />
                    {data ? "Server Live" : "Disconnected"}
                </div>
            </div>

            {/* ── KPI Cards ─────────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {kpis.map((kpi, i) => (
                    <Card key={i} className={`relative overflow-hidden transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 ${kpi.highlightKey ? "border-blue-200 bg-blue-50/30" : "bg-white border-slate-200"}`}>
                        {kpi.highlightKey && <BorderBeam duration={8} size={150} />}
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-slate-500">{kpi.title}</CardTitle>
                            <kpi.icon className={`h-4 w-4 ${kpi.highlightKey ? "text-blue-600" : kpi.highlight ? "text-red-500" : "text-slate-400"}`} />
                        </CardHeader>
                        <CardContent>
                            <div className={`text-2xl font-bold ${kpi.highlightKey ? "text-blue-700" : kpi.highlight ? "text-red-600" : "text-slate-900"}`}>{kpi.value}</div>
                            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                                {i === 2 || i === 4 ? <ArrowUpRight className="h-3 w-3 text-green-500" /> : null}
                                {kpi.trend}
                            </p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* User Real Local Dataset Upload Controller */}
            <Card className="bg-white border-slate-200 shadow-sm relative overflow-hidden">
                <CardHeader>
                    <CardTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <Cpu className="w-5 h-5 text-indigo-500" />
                        Local Dataset Training
                    </CardTitle>
                    <p className="text-slate-500 text-sm max-w-3xl mt-1">
                        Upload your personal dataset (.csv) or provide a remote URL. The server will spin up a decentralized training worker in the background exclusively containing your local data. Once training is complete, fetch your customized locally-trained weights (.pt).
                    </p>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col gap-5">
                        <div className="flex flex-wrap gap-4 items-end">
                            <div className="flex flex-col gap-2">
                                <label className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Target Client ID</label>
                                <input
                                    className="bg-slate-50 border border-slate-200 text-slate-900 px-4 py-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 w-64 transition-all font-mono text-sm"
                                    value={uploadClientId}
                                    onChange={(e) => setUploadClientId(e.target.value)}
                                    placeholder="e.g. MyEdgeNode-1"
                                />
                            </div>

                            <div className="flex flex-col gap-2">
                                <label className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Dataset File OR URL</label>
                                <div className="flex flex-col gap-2">
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        onChange={handleFileChange}
                                        className="text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 transition-all cursor-pointer"
                                    />
                                    <div className="text-xs text-slate-400 font-medium tracking-wide">— OR —</div>
                                    <input
                                        type="text"
                                        placeholder="https://example.com/dataset.csv"
                                        value={datasetUrl}
                                        onChange={(e) => setDatasetUrl(e.target.value)}
                                        className="bg-slate-50 border border-slate-200 text-slate-900 px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 w-64 transition-all text-sm"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-3 ml-auto">
                                <button
                                    onClick={handleDatasetUpload}
                                    disabled={isUploading}
                                    className={`transition-all px-6 py-2.5 rounded-lg font-semibold flex items-center gap-2 shadow-sm ${isUploading
                                        ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                                        : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                                        }`}
                                >
                                    <ArrowUpRight className={`w-4 h-4 ${isUploading ? 'animate-bounce' : ''}`} />
                                    {isUploading ? 'Uploading...' : 'Upload & Train'}
                                </button>

                                <button
                                    onClick={handleFetchWeights}
                                    className="transition-all px-6 py-2.5 rounded-lg font-semibold flex items-center gap-2 shadow-sm border border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
                                >
                                    Fetch Weights
                                </button>
                            </div>
                        </div>

                        {uploadStatus && (
                            <div className={`p-4 rounded-lg text-sm font-medium border flex items-center gap-3 ${uploadStatus.type === "success" ? "bg-green-50 text-green-700 border-green-200" :
                                uploadStatus.type === "error" ? "bg-red-50 text-red-700 border-red-200" :
                                    "bg-blue-50 text-blue-700 border-blue-200"
                                }`}>
                                {isTraining && (
                                    <svg className="animate-spin h-4 w-4 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                    </svg>
                                )}
                                <span>{isTraining ? "Training in progress… Charts will update automatically." : uploadStatus.msg}</span>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* ── Real-Time Insights Panel ─────────────────────────────────── */}
            <Card className="bg-linear-to-br from-slate-900 to-slate-800 border-slate-700 shadow-xl text-white">
                <CardHeader>
                    <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                        <Zap className="w-4 h-4 text-yellow-400" />
                        Real-Time System Insights
                        <span className="ml-auto text-[10px] font-normal text-slate-400 animate-pulse">● Live</span>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {insights.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {insights.map((ins, i) => (
                                <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${ins.type === "ok" ? "bg-green-900/20 border-green-700/40" : ins.type === "warn" ? "bg-red-900/20 border-red-700/40" : "bg-slate-700/40 border-slate-600/40"}`}>
                                    <ins.icon className={`w-5 h-5 mt-0.5 shrink-0 ${ins.color}`} />
                                    <div>
                                        <p className="text-sm font-semibold text-white">{ins.label}</p>
                                        <p className="text-xs text-slate-300 mt-0.5">{ins.detail}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-sm text-slate-400 italic">Loading insights...</div>
                    )}
                </CardContent>
            </Card>

            {/* ── Combined Accuracy + Loss Chart (Dual Axis) ─────────────────────────────────── */}
            <Card className="bg-white border-slate-200 shadow-sm">
                <CardHeader>
                    <CardTitle className="text-lg font-bold text-slate-900">Convergence — Accuracy & Loss Per Round</CardTitle>
                    <p className="text-sm text-slate-400 mt-0.5">Blue = Accuracy (left axis) · Red = Training Loss (right axis)</p>
                </CardHeader>
                <CardContent>
                    <div className={`h-72 w-full rounded-xl border-2 bg-slate-50/50 p-2 transition-all duration-700 ${chartFlash ? "border-indigo-400 shadow-lg shadow-indigo-100" : "border-slate-100"
                        }`}>
                        {combinedChartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={combinedChartData}>
                                    <defs>
                                        <linearGradient id="accGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15} />
                                            <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                    <XAxis dataKey="version" stroke="#94a3b8" fontSize={12} tickLine={false} />
                                    <YAxis yAxisId="acc" stroke="#2563eb" fontSize={11} tickLine={false} axisLine={false}
                                        tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                                    <YAxis yAxisId="loss" orientation="right" stroke="#ef4444" fontSize={11}
                                        tickLine={false} axisLine={false} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: "#fff", borderColor: "#e2e8f0", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                                        formatter={(value: any, name: any) =>
                                            name === "accuracy" ? [`${value}%`, "Accuracy"] : [value, "Loss"]
                                        }
                                    />
                                    <Legend wrapperStyle={{ fontSize: 12 }} />
                                    <Area yAxisId="acc" type="monotone" dataKey="accuracy" name="accuracy"
                                        stroke="#2563eb" strokeWidth={2.5} fill="url(#accGrad)"
                                        dot={{ fill: "#2563eb", r: 3 }} activeDot={{ r: 5 }} />
                                    <Line yAxisId="loss" type="monotone" dataKey="loss" name="loss"
                                        stroke="#ef4444" strokeWidth={2} strokeDasharray="5 3"
                                        dot={{ fill: "#ef4444", r: 3 }} activeDot={{ r: 5 }} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                                No evaluation data yet. Upload a dataset or fire a simulation.
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* ── Acceptance Rate Bar Chart ──────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="bg-white border-slate-200 shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-base font-bold text-slate-900">Client Update Acceptance per Round</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-56 rounded-xl border border-slate-100 bg-slate-50/50 p-2">
                            {acceptanceData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={acceptanceData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                        <XAxis dataKey="round" stroke="#94a3b8" fontSize={11} tickLine={false} />
                                        <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                                        <Tooltip contentStyle={{ backgroundColor: "#fff", borderColor: "#e2e8f0", borderRadius: 8 }} />
                                        <Legend wrapperStyle={{ fontSize: 12 }} />
                                        <Bar dataKey="accepted" name="Accepted" fill="#22c55e" radius={[3, 3, 0, 0]} />
                                        <Bar dataKey="rejected" name="Rejected" fill="#ef4444" radius={[3, 3, 0, 0]} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex items-center justify-center text-slate-400 text-sm">No round data yet.</div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* ── Recent Aggregation Activity ──────────────────────────────── */}
                <Card className="bg-white border-slate-200 shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-base font-bold text-slate-900">Recent Aggregation Events</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-hidden rounded-b-lg">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-xs">
                                    <tr>
                                        <th className="px-4 py-3 font-semibold">Version</th>
                                        <th className="px-4 py-3 font-semibold">Details</th>
                                        <th className="px-4 py-3 font-semibold text-right">Time</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {activityFeed.length > 0 ? activityFeed.map((row, i) => (
                                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-4 py-3">
                                                <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                                    {row.details.split(" ")[0]}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-slate-500 text-xs">{row.details.split(" — ")[1] ?? row.details}</td>
                                            <td className="px-4 py-3 text-right text-slate-400 text-xs tabular-nums">{row.time}</td>
                                        </tr>
                                    )) : (
                                        <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-400">No events yet.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* ── Blockchain / Token Economy Panel ─────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Economy Wallets */}
                <Card className="bg-white border-slate-200 shadow-sm lg:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                            <Wallet className="w-5 h-5 text-indigo-500" />
                            Web3 Token Economy (FLT)
                        </CardTitle>
                        <p className="text-sm text-slate-500 mt-1">
                            Live nodes holding automated smart-contract stakes on the local EVM.
                        </p>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto rounded-b-lg border-t border-slate-100">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-xs">
                                    <tr>
                                        <th className="px-4 py-3 font-semibold">Client ID</th>
                                        <th className="px-4 py-3 font-semibold">Wallet Address</th>
                                        <th className="px-4 py-3 font-semibold text-right">Staked</th>
                                        <th className="px-4 py-3 font-semibold text-right">Balance</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {blockchainData?.wallets && blockchainData.wallets.length > 0 ? (
                                        blockchainData.wallets.map((w, i) => (
                                            <tr key={i} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-4 py-3 font-medium text-slate-900 text-xs">{w.client_id}</td>
                                                <td className="px-4 py-3 font-mono text-slate-400 text-xs">{w.wallet}</td>
                                                <td className="px-4 py-3 text-right">
                                                    <span className="font-semibold text-indigo-600">{w.staked} FLT</span>
                                                </td>
                                                <td className="px-4 py-3 text-right text-slate-700 font-medium">
                                                    {w.balance} FLT
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">No active wallets yet.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>

                {/* Smart Contract Events */}
                <Card className="bg-white border-slate-200 shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                            <FileText className="w-5 h-5 text-indigo-500" />
                            Live EVM Transactions
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="h-64 overflow-y-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] sticky top-0">
                                    <tr>
                                        <th className="px-4 py-2 font-semibold">Event</th>
                                        <th className="px-4 py-2 font-semibold text-right">Amt</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {blockchainData?.recent_transactions && blockchainData.recent_transactions.length > 0 ? (
                                        blockchainData.recent_transactions.map((tx, i) => (
                                            <tr key={i} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-4 py-3">
                                                    <div className="flex flex-col gap-1">
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold self-start border ${tx.action === 'STAKE' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                            tx.action === 'REWARD' ? 'bg-green-50 text-green-700 border-green-200' :
                                                                'bg-red-50 text-red-700 border-red-200'
                                                            }`}>
                                                            {tx.action}
                                                        </span>
                                                        <span className="font-mono text-[10px] text-slate-400 truncate w-32" title={tx.tx_hash}>
                                                            {tx.tx_hash.substring(0, 16)}...
                                                        </span>
                                                        <span className="text-xs font-semibold text-slate-600">{tx.client_id}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <span className={`font-bold ${tx.action === 'SLASH' ? 'text-red-500' : 'text-slate-700'}`}>
                                                        {tx.action === 'SLASH' ? '-' : '+'}{tx.amount}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr><td colSpan={2} className="px-4 py-8 text-center text-slate-400 text-xs">No transactions in the pool.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>

            </div>

        </div>
    );
}
